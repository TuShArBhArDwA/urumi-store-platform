import * as k8s from '@kubernetes/client-node';
import { logger } from '../utils/logger';

export class K8sService {
    private coreApi: k8s.CoreV1Api;
    private appsApi: k8s.AppsV1Api;
    private networkingApi: k8s.NetworkingV1Api;

    constructor() {
        const kc = new k8s.KubeConfig();

        // Load config from default location or in-cluster
        try {
            kc.loadFromCluster();
            logger.info('Loaded Kubernetes config from cluster');
        } catch {
            kc.loadFromDefault();
            logger.info('Loaded Kubernetes config from default location');
        }

        this.coreApi = kc.makeApiClient(k8s.CoreV1Api);
        this.appsApi = kc.makeApiClient(k8s.AppsV1Api);
        this.networkingApi = kc.makeApiClient(k8s.NetworkingV1Api);
    }

    async createNamespace(name: string): Promise<void> {
        try {
            await this.coreApi.createNamespace({
                metadata: {
                    name,
                    labels: {
                        'app.kubernetes.io/managed-by': 'store-platform',
                        'store-platform/type': 'store'
                    }
                }
            });
            logger.info(`Created namespace: ${name}`);
        } catch (error: any) {
            if (error.response?.statusCode === 409) {
                logger.info(`Namespace ${name} already exists`);
                return;
            }
            throw error;
        }
    }

    async deleteNamespace(name: string): Promise<void> {
        try {
            await this.coreApi.deleteNamespace({ name });
            logger.info(`Deleted namespace: ${name}`);
        } catch (error: any) {
            if (error.response?.statusCode === 404) {
                logger.info(`Namespace ${name} not found, skipping deletion`);
                return;
            }
            throw error;
        }
    }

    async createResourceQuota(namespace: string): Promise<void> {
        const quota: k8s.V1ResourceQuota = {
            metadata: {
                name: 'store-quota',
                namespace
            },
            spec: {
                hard: {
                    'requests.cpu': '1',
                    'requests.memory': '2Gi',
                    'limits.cpu': '2',
                    'limits.memory': '4Gi',
                    'persistentvolumeclaims': '3',
                    'pods': '10'
                }
            }
        };

        try {
            await this.coreApi.createNamespacedResourceQuota({ namespace, body: quota });
            logger.info(`Created resource quota in namespace: ${namespace}`);
        } catch (error: any) {
            if (error.response?.statusCode === 409) {
                logger.info(`Resource quota already exists in ${namespace}`);
                return;
            }
            throw error;
        }

        // Create LimitRange
        const limitRange: k8s.V1LimitRange = {
            metadata: {
                name: 'store-limits',
                namespace
            },
            spec: {
                limits: [
                    {
                        type: 'Container',
                        default: {
                            cpu: '500m',
                            memory: '512Mi'
                        },
                        defaultRequest: {
                            cpu: '100m',
                            memory: '128Mi'
                        }
                    }
                ]
            }
        };

        try {
            await this.coreApi.createNamespacedLimitRange({ namespace, body: limitRange });
            logger.info(`Created limit range in namespace: ${namespace}`);
        } catch (error: any) {
            if (error.response?.statusCode === 409) {
                logger.info(`Limit range already exists in ${namespace}`);
            }
        }
    }

    async deployWooCommerceDatabase(namespace: string, storeId: string): Promise<void> {
        const dbPassword = this.generatePassword();
        const secretName = 'mariadb-secret';

        // Create secret for database credentials
        await this.createSecret(namespace, secretName, {
            'mariadb-root-password': Buffer.from(dbPassword).toString('base64'),
            'mariadb-password': Buffer.from(dbPassword).toString('base64'),
            'mariadb-database': Buffer.from('wordpress').toString('base64'),
            'mariadb-user': Buffer.from('wordpress').toString('base64')
        });

        // Create PVC for database
        await this.createPVC(namespace, 'mariadb-data', '5Gi');

        // Create MariaDB StatefulSet
        const statefulSet: k8s.V1StatefulSet = {
            metadata: {
                name: 'mariadb',
                namespace
            },
            spec: {
                serviceName: 'mariadb',
                replicas: 1,
                selector: {
                    matchLabels: {
                        app: 'mariadb'
                    }
                },
                template: {
                    metadata: {
                        labels: {
                            app: 'mariadb'
                        }
                    },
                    spec: {
                        containers: [
                            {
                                name: 'mariadb',
                                image: 'mariadb:10.11',
                                ports: [{ containerPort: 3306, name: 'mysql' }],
                                env: [
                                    {
                                        name: 'MARIADB_ROOT_PASSWORD',
                                        valueFrom: {
                                            secretKeyRef: { name: secretName, key: 'mariadb-root-password' }
                                        }
                                    },
                                    {
                                        name: 'MARIADB_DATABASE',
                                        value: 'wordpress'
                                    },
                                    {
                                        name: 'MARIADB_USER',
                                        value: 'wordpress'
                                    },
                                    {
                                        name: 'MARIADB_PASSWORD',
                                        valueFrom: {
                                            secretKeyRef: { name: secretName, key: 'mariadb-password' }
                                        }
                                    }
                                ],
                                volumeMounts: [
                                    {
                                        name: 'data',
                                        mountPath: '/var/lib/mysql'
                                    }
                                ],
                                resources: {
                                    requests: { cpu: '100m', memory: '256Mi' },
                                    limits: { cpu: '500m', memory: '512Mi' }
                                },
                                livenessProbe: {
                                    exec: {
                                        command: ['mysqladmin', 'ping', '-h', 'localhost', '-uroot', `-p$(cat /run/secrets/mariadb-root-password || echo $MARIADB_ROOT_PASSWORD)`]
                                    },
                                    initialDelaySeconds: 30,
                                    periodSeconds: 10
                                },
                                readinessProbe: {
                                    exec: {
                                        command: ['mysqladmin', 'ping', '-h', 'localhost', '-uroot', `-p$(cat /run/secrets/mariadb-root-password || echo $MARIADB_ROOT_PASSWORD)`]
                                    },
                                    initialDelaySeconds: 5,
                                    periodSeconds: 5
                                }
                            }
                        ],
                        volumes: [
                            {
                                name: 'data',
                                persistentVolumeClaim: { claimName: 'mariadb-data' }
                            }
                        ]
                    }
                }
            }
        };

        await this.appsApi.createNamespacedStatefulSet({ namespace, body: statefulSet });
        logger.info(`Created MariaDB StatefulSet in ${namespace}`);

        // Create MariaDB Service
        const service: k8s.V1Service = {
            metadata: {
                name: 'mariadb',
                namespace
            },
            spec: {
                selector: { app: 'mariadb' },
                ports: [{ port: 3306, targetPort: 3306 }],
                clusterIP: 'None'
            }
        };

        await this.coreApi.createNamespacedService({ namespace, body: service });
        logger.info(`Created MariaDB Service in ${namespace}`);

        // Wait for MariaDB to be ready
        await this.waitForStatefulSetReady(namespace, 'mariadb', 120000);
    }

    async deployWordPress(namespace: string, storeId: string): Promise<void> {
        const secretName = 'mariadb-secret';

        // Create PVC for WordPress content
        await this.createPVC(namespace, 'wordpress-data', '10Gi');

        // Create WordPress Deployment
        const deployment: k8s.V1Deployment = {
            metadata: {
                name: 'wordpress',
                namespace
            },
            spec: {
                replicas: 1,
                selector: {
                    matchLabels: { app: 'wordpress' }
                },
                template: {
                    metadata: {
                        labels: { app: 'wordpress' }
                    },
                    spec: {
                        initContainers: [
                            {
                                name: 'wait-for-db',
                                image: 'busybox:1.36',
                                command: ['sh', '-c', 'until nc -z mariadb 3306; do echo waiting for mariadb; sleep 2; done;']
                            }
                        ],
                        containers: [
                            {
                                name: 'wordpress',
                                image: 'wordpress:6.4-apache',
                                ports: [{ containerPort: 80, name: 'http' }],
                                env: [
                                    { name: 'WORDPRESS_DB_HOST', value: 'mariadb:3306' },
                                    { name: 'WORDPRESS_DB_NAME', value: 'wordpress' },
                                    { name: 'WORDPRESS_DB_USER', value: 'wordpress' },
                                    {
                                        name: 'WORDPRESS_DB_PASSWORD',
                                        valueFrom: {
                                            secretKeyRef: { name: secretName, key: 'mariadb-password' }
                                        }
                                    },
                                    { name: 'WORDPRESS_CONFIG_EXTRA', value: "define('WP_HOME', 'http://' . $_SERVER['HTTP_HOST']); define('WP_SITEURL', 'http://' . $_SERVER['HTTP_HOST']);" }
                                ],
                                volumeMounts: [
                                    {
                                        name: 'wordpress-data',
                                        mountPath: '/var/www/html'
                                    }
                                ],
                                resources: {
                                    requests: { cpu: '200m', memory: '256Mi' },
                                    limits: { cpu: '1', memory: '1Gi' }
                                },
                                livenessProbe: {
                                    httpGet: { path: '/wp-admin/install.php', port: 80 },
                                    initialDelaySeconds: 60,
                                    periodSeconds: 15
                                },
                                readinessProbe: {
                                    httpGet: { path: '/wp-admin/install.php', port: 80 },
                                    initialDelaySeconds: 30,
                                    periodSeconds: 5
                                }
                            }
                        ],
                        volumes: [
                            {
                                name: 'wordpress-data',
                                persistentVolumeClaim: { claimName: 'wordpress-data' }
                            }
                        ]
                    }
                }
            }
        };

        await this.appsApi.createNamespacedDeployment({ namespace, body: deployment });
        logger.info(`Created WordPress Deployment in ${namespace}`);

        // Create WordPress Service
        const service: k8s.V1Service = {
            metadata: {
                name: 'wordpress',
                namespace
            },
            spec: {
                selector: { app: 'wordpress' },
                ports: [{ port: 80, targetPort: 80 }],
                type: 'ClusterIP'
            }
        };

        await this.coreApi.createNamespacedService({ namespace, body: service });
        logger.info(`Created WordPress Service in ${namespace}`);
    }

    async createStoreIngress(namespace: string, storeId: string): Promise<void> {
        const baseDomain = process.env.BASE_DOMAIN || '127.0.0.1.nip.io';
        const host = `${storeId}.${baseDomain}`;

        const ingress: k8s.V1Ingress = {
            metadata: {
                name: 'store-ingress',
                namespace,
                annotations: {
                    'nginx.ingress.kubernetes.io/proxy-body-size': '50m'
                }
            },
            spec: {
                ingressClassName: 'nginx',
                rules: [
                    {
                        host,
                        http: {
                            paths: [
                                {
                                    path: '/',
                                    pathType: 'Prefix',
                                    backend: {
                                        service: {
                                            name: 'wordpress',
                                            port: { number: 80 }
                                        }
                                    }
                                }
                            ]
                        }
                    }
                ]
            }
        };

        await this.networkingApi.createNamespacedIngress({ namespace, body: ingress });
        logger.info(`Created Ingress for ${host} in ${namespace}`);
    }

    async isDeploymentReady(namespace: string, name: string): Promise<boolean> {
        try {
            const response = await this.appsApi.readNamespacedDeployment({ name, namespace });
            const deployment = response;
            return (deployment.status?.readyReplicas || 0) >= (deployment.spec?.replicas || 1);
        } catch {
            return false;
        }
    }

    async waitForDeploymentReady(namespace: string, name: string, timeoutMs: number): Promise<void> {
        const startTime = Date.now();

        while (Date.now() - startTime < timeoutMs) {
            if (await this.isDeploymentReady(namespace, name)) {
                logger.info(`Deployment ${name} is ready in ${namespace}`);
                return;
            }
            await this.sleep(5000);
        }

        throw new Error(`Timeout waiting for deployment ${name} to be ready`);
    }

    async waitForStatefulSetReady(namespace: string, name: string, timeoutMs: number): Promise<void> {
        const startTime = Date.now();

        while (Date.now() - startTime < timeoutMs) {
            try {
                const response = await this.appsApi.readNamespacedStatefulSet({ name, namespace });
                const ss = response;
                if ((ss.status?.readyReplicas || 0) >= (ss.spec?.replicas || 1)) {
                    logger.info(`StatefulSet ${name} is ready in ${namespace}`);
                    return;
                }
            } catch {
                // Not ready yet
            }
            await this.sleep(5000);
        }

        throw new Error(`Timeout waiting for StatefulSet ${name} to be ready`);
    }

    private async createSecret(namespace: string, name: string, data: Record<string, string>): Promise<void> {
        const secret: k8s.V1Secret = {
            metadata: { name, namespace },
            type: 'Opaque',
            data
        };

        try {
            await this.coreApi.createNamespacedSecret({ namespace, body: secret });
            logger.info(`Created secret ${name} in ${namespace}`);
        } catch (error: any) {
            if (error.response?.statusCode === 409) {
                logger.info(`Secret ${name} already exists in ${namespace}`);
                return;
            }
            throw error;
        }
    }

    private async createPVC(namespace: string, name: string, size: string): Promise<void> {
        const pvc: k8s.V1PersistentVolumeClaim = {
            metadata: { name, namespace },
            spec: {
                accessModes: ['ReadWriteOnce'],
                resources: {
                    requests: { storage: size }
                }
            }
        };

        try {
            await this.coreApi.createNamespacedPersistentVolumeClaim({ namespace, body: pvc });
            logger.info(`Created PVC ${name} (${size}) in ${namespace}`);
        } catch (error: any) {
            if (error.response?.statusCode === 409) {
                logger.info(`PVC ${name} already exists in ${namespace}`);
                return;
            }
            throw error;
        }
    }

    private generatePassword(): string {
        const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let password = '';
        for (let i = 0; i < 24; i++) {
            password += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return password;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

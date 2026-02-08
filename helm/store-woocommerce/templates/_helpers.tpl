{{/* WooCommerce Helm Template Helpers */}}

{{- define "store-woocommerce.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "store-woocommerce.labels" -}}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: store-platform
store-platform/store-id: {{ .Values.storeId | quote }}
{{- end }}

{{- define "store-woocommerce.host" -}}
{{ .Values.storeId }}.{{ .Values.ingress.baseDomain }}
{{- end }}

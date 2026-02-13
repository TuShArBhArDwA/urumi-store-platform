FROM wordpress:6.4-apache

# Overlay WordPress core from vendored files to satisfy WooCommerce minimum
# version requirements even when we cannot pull newer base tags live.
COPY docker/wordpress-woocommerce/wordpress-core /usr/src/wordpress

# Bundle WooCommerce at image build time from local vendored plugin files.
COPY docker/wordpress-woocommerce/woocommerce /usr/src/wordpress/wp-content/plugins/woocommerce

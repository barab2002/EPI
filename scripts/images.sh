# Sourced helper: resolves the pinned image references from deploy/images.lock.
# Exports EPI_NODE_IMAGE, EPI_POSTGRES_IMAGE, EPI_KEYCLOAK_IMAGE unless already set.
_epi_lock="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/deploy/images.lock"
# shellcheck source=../deploy/images.lock
. "$_epi_lock"
_epi_reg="${EPI_IMAGE_REGISTRY:-docker.io}"
export EPI_NODE_IMAGE="${EPI_NODE_IMAGE:-$_epi_reg/$EPI_NODE_REF}"
export EPI_POSTGRES_IMAGE="${EPI_POSTGRES_IMAGE:-$_epi_reg/$EPI_POSTGRES_REF}"
export EPI_KEYCLOAK_IMAGE="${EPI_KEYCLOAK_IMAGE:-$EPI_KEYCLOAK_PINNED}"
export EPI_OPENLDAP_TEST_IMAGE="${EPI_OPENLDAP_TEST_IMAGE:-$_epi_reg/$EPI_OPENLDAP_TEST_REF}"
unset _epi_lock _epi_reg

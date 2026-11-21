ARG KEYCLOAK_IMAGE=quay.io/keycloak/keycloak:26.7.5
ARG NODE_IMAGE=node:26.12.1-bookworm-slim
FROM ${NODE_IMAGE} AS bootstrap
FROM registry.access.redhat.com/ubi9/ubi:9.8 AS bootstrap-libs
RUN dnf install --installroot /mnt/rootfs libstdc++ libatomic --releasever 9 --setopt install_weak_deps=false --nodocs -y
FROM ${KEYCLOAK_IMAGE} AS builder
ENV KC_DB=postgres KC_HEALTH_ENABLED=true KC_METRICS_ENABLED=true
RUN /opt/keycloak/bin/kc.sh build
FROM ${KEYCLOAK_IMAGE}
COPY --from=builder /opt/keycloak/ /opt/keycloak/
COPY --chown=keycloak:keycloak themes/ /opt/keycloak/themes/
COPY --from=bootstrap /usr/local/bin/node /usr/local/bin/node
COPY --from=bootstrap-libs /mnt/rootfs/usr/lib64/libatomic.so.1* /usr/lib64/
COPY --from=bootstrap-libs /mnt/rootfs/usr/lib64/libstdc++.so.6* /usr/lib64/
COPY --from=bootstrap-libs /mnt/rootfs/usr/lib64/libgcc_s.so.1 /usr/lib64/
COPY --chown=keycloak:keycloak configure.mjs /opt/formiq/bootstrap/configure.mjs
COPY --chown=keycloak:keycloak realm-roles.mjs /opt/formiq/bootstrap/realm-roles.mjs
COPY --chown=keycloak:keycloak --chmod=0755 start.sh /opt/formiq/bootstrap/start.sh
RUN node --version
ENTRYPOINT ["/opt/formiq/bootstrap/start.sh"]

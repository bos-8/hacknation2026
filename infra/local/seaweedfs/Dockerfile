ARG SEAWEEDFS_IMAGE=chrislusf/seaweedfs:4.51
ARG NODE_IMAGE=node:26.12.1-alpine
FROM ${SEAWEEDFS_IMAGE} AS storage
FROM ${NODE_IMAGE}
COPY --from=storage /usr/bin/weed /usr/local/bin/weed
COPY configure.mjs init-bucket.mjs /bootstrap/
COPY --chmod=0755 start.sh /bootstrap/start.sh
ENTRYPOINT ["/bootstrap/start.sh"]

# prod-bundle-A

这个目录用于“离线/半离线”生产部署：把后端镜像导出为 tar，一起拷到生产机后 `docker load` 即可启动。

## 在打包机（本地/CI）构建并导出镜像

```bash
./prod-bundle-A/build-bundle.sh
# 或指定 tag
./prod-bundle-A/build-bundle.sh prod-20260111
```

产物：`chatlive-backend_<tag>.tar`

## 在生产机离线部署

```bash
# 1) 把整个 prod-bundle-A/ 目录拷到生产机
# 2) 准备环境变量
cp .env.prod.example .env
# 编辑 .env：至少改 POSTGRES_PASSWORD / MINIO_ROOT_PASSWORD / JWT_SECRET 等

# 3) 一键离线部署
./deploy-offline.sh
```

如果你不想用脚本，也可以手动：

```bash
docker load -i chatlive-backend_<tag>.tar
# .env 里设置 CHATLIVE_BACKEND_IMAGE_TAG=<tag>
docker compose --env-file .env -f docker-compose.prod.yml up -d
```

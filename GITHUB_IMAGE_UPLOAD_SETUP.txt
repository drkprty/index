DRKPRTY GitHub Content Setup

Destino actual del admin:
- Owner: drkprty
- Repo: content
- Branch: main
- Images path: images
- Articles path: articles
- Public base URL: https://cdn.jsdelivr.net/gh/drkprty/content@main

Token recomendado:
- GitHub Fine-grained personal access token
- Repository access: Only selected repositories -> drkprty/content
- Repository permissions: Contents -> Read and Write

Importante:
- Si el repo content está completamente vacío, crea un README inicial para que exista la branch main.
- El token se guarda solo en localStorage del navegador del admin. No se sube al repo.
- Al guardar un artículo, el admin guarda en Firebase y también crea/actualiza articles/<slug>.json en drkprty/content.
- Si seleccionas un archivo de imagen, lo sube a images/<slug>-timestamp.ext y reemplaza el campo de imagen con URL CDN.

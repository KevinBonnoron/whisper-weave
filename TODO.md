# TODO - Audit de sécurité

## Problèmes critiques

- [ ] **Mot de passe par défaut en dur** - [server/src/lib/config.ts:11](server/src/lib/config.ts#L11)
  - Le fallback `changeme123` est dangereux si déployé sans variable d'environnement
  - Lever une erreur si `PB_SUPERUSER_PASSWORD` n'est pas défini en production

- [ ] **CORS ouvert par défaut (`*`)** - [server/src/lib/config.ts:4](server/src/lib/config.ts#L4)
  - Permet à n'importe quel site d'appeler l'API
  - Exiger une valeur explicite pour `CORS_ORIGINS` ou utiliser un fallback restrictif

- [ ] **API sans authentification** - [server/src/routes/chat.routes.ts](server/src/routes/chat.routes.ts), [server/src/routes/plugins.routes.ts](server/src/routes/plugins.routes.ts)
  - Les routes `/api/chat` et `/api/plugins` n'ont aucune authentification
  - N'importe qui peut envoyer des messages aux LLM (coûts API) et lister les plugins
  - Ajouter un middleware d'authentification

## Problèmes moyens

- [ ] **`postMessage` avec targetOrigin `'*'`** - [server/src/routes/auth.routes.ts:98](server/src/routes/auth.routes.ts#L98)
  - Le refresh token Google est envoyé à n'importe quelle origine
  - Passer l'origin de l'app dans le state et l'utiliser comme targetOrigin

- [ ] **Injection potentielle dans les requêtes PocketBase** - [server/src/plugins/plugin-manager.ts:23](server/src/plugins/plugin-manager.ts#L23)
  - Utilisation de string interpolation pour les filtres (`connector = "${connectorId}"`)
  - Utiliser des paramètres de requête typés ou échapper les valeurs

- [ ] **`console.log` avec données sensibles** - [server/src/plugins/home-assistant.ts:145](server/src/plugins/home-assistant.ts#L145)
  - Les inputs des outils peuvent contenir des données sensibles
  - Supprimer ce log ou utiliser le logger structuré avec niveau DEBUG

## Points positifs

- [x] Fichier `.env` non tracké par git
- [x] `.gitignore` couvre les fichiers `.env*`
- [x] Pas de secrets API hardcodés détectés
- [x] Headers de sécurité nginx (X-Frame-Options, X-Content-Type-Options, etc.)
- [x] Validation Zod sur les routes auth
- [x] `escapeHtml()` utilisé pour les erreurs affichées
- [x] Support Docker secrets pour le mot de passe
- [x] Pas de `dangerouslySetInnerHTML` dans React

# UX Review - Whisper Weave

## Bilan Général

### Points Forts

1. **Architecture claire** - Navigation simple avec 6 sections bien définies
2. **Dashboard guidé** - Warnings qui orientent l'utilisateur vers la configuration initiale
3. **Design system unifié** - Utilisation cohérente de shadcn/ui
4. **Real-time** - Synchronisation PocketBase en temps réel
5. **i18n** - Support EN/FR bien intégré
6. **Dark mode** - Support complet avec détection système

### Points d'Amélioration

| Priorité | Problème | Impact |
|----------|----------|--------|
| Haute | Concept "Assistant" confus | Clarté UX |
| Haute | Flux de configuration fragmenté | Adoption |
| Moyenne | Pas de filtres sur la page Plugins | Navigation |
| Moyenne | Cron syntax brut pour Automations | Accessibilité |
| Moyenne | Pas de search dans les conversations | Productivité |
| Basse | Preview markdown pour Skills | Polish |
| Basse | Pas d'indicateur de typing/streaming | Feedback |

---

## Problème Principal : Le Concept "Assistant"

### Situation Actuelle

```
┌─────────────────────────────────────────────────────────────┐
│                    AssistantRecord                          │
├─────────────────────────────────────────────────────────────┤
│ connector: string (REQUIRED) ────► Plugin (Discord, etc.)   │
│ llmProvider: string ─────────────► Plugin (Claude, Ollama)  │
│ llmModel: string                                            │
│ actions: string[] ───────────────► Plugins (tools)          │
│ systemPrompt?: string                                       │
│ defaultChannel?: string                                     │
└─────────────────────────────────────────────────────────────┘
```

**Problèmes :**

1. **Couplage fort** : Un assistant est lié 1-1 à un connector
2. **Duplication** : Pour utiliser le même "assistant" sur Discord ET Telegram → créer 2 assistants identiques
3. **Confusion UX** : L'utilisateur pense "assistant = personnalité IA", mais c'est en fait "assistant = config de connector"
4. **UI Web orpheline** : Les conversations dans l'UI web ne sont pas des "assistants", elles n'ont pas de system prompt ni de tools persistants

### Vision Proposée

> **Un Assistant = une personnalité IA réutilisable**
> - LLM Provider + Model
> - System Prompt
> - Tools autorisés
>
> **Un Connector = un point d'entrée qui utilise un Assistant**

---

## Options d'Architecture

### Option A : Inversion Simple

Le connector pointe vers l'assistant qu'il utilise.

```
┌─────────────────────┐         ┌─────────────────────────┐
│      Assistant      │         │       Connector         │
├─────────────────────┤         ├─────────────────────────┤
│ name                │◄────────│ assistant: relation     │
│ llmProvider         │         │ type (discord, etc.)    │
│ llmModel            │         │ config (token, etc.)    │
│ systemPrompt        │         │ enabled                 │
│ actions[]           │         └─────────────────────────┘
└─────────────────────┘
```

**Pros :**
- Simple à implémenter
- Un assistant peut être partagé par plusieurs connectors
- L'UI web peut utiliser directement un assistant

**Cons :**
- Un connector ne peut utiliser qu'un seul assistant
- Pas de granularité par channel

---

### Option B : Table de Liaison

Relation many-to-many avec règles de routage.

```
┌─────────────────────┐         ┌─────────────────────────┐
│      Assistant      │         │       Connector         │
├─────────────────────┤         ├─────────────────────────┤
│ name                │         │ type                    │
│ llmProvider         │         │ config                  │
│ llmModel            │         │ enabled                 │
│ systemPrompt        │         └───────────┬─────────────┘
│ actions[]           │                     │
└──────────┬──────────┘                     │
           │                                │
           │    ┌───────────────────────┐   │
           └────┤   ConnectorAssistant  ├───┘
                ├───────────────────────┤
                │ connector: relation   │
                │ assistant: relation   │
                │ channelFilter?: string│
                │ priority?: number     │
                └───────────────────────┘
```

**Pros :**
- Flexibilité maximale
- Règles par channel (ex: #support → assistant support, #general → assistant casual)
- Priorités pour fallback

**Cons :**
- Plus complexe à implémenter
- UX de configuration plus lourde

---

### Option C : Assistant par Défaut + UI Web

L'assistant devient l'entité centrale, les connectors sont des "abonnés".

```
┌─────────────────────────────────────────┐
│              Assistant                  │
├─────────────────────────────────────────┤
│ name                                    │
│ llmProvider: relation                   │
│ llmModel: string                        │
│ systemPrompt?: string                   │
│ actions[]: relation[]                   │
│ isDefault?: boolean  ◄── Pour l'UI web  │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│              Connector                  │
├─────────────────────────────────────────┤
│ type: string                            │
│ name: string                            │
│ config: json                            │
│ enabled: boolean                        │
│ assistant?: relation  ◄── Optionnel     │
│ channelRules?: json   ◄── Mapping avancé│
└─────────────────────────────────────────┘
```

**Flux :**
1. Message arrive sur Connector
2. Si `channelRules` match → utiliser l'assistant mappé
3. Sinon si `assistant` défini → utiliser cet assistant
4. Sinon → erreur ou assistant par défaut global

**Pros :**
- Balance entre simplicité et flexibilité
- L'UI web peut utiliser n'importe quel assistant
- Possibilité d'avoir un assistant "par défaut" pour l'UI
- Les règles par channel restent possibles sans table de liaison

**Cons :**
- Le champ `channelRules` en JSON est moins propre qu'une vraie relation

---

### Option D : Conversations liées à un Assistant

Chaque conversation (y compris UI web) est liée à un assistant.

```
┌─────────────────────────────────────────┐
│              Conversation               │
├─────────────────────────────────────────┤
│ title?: string                          │
│ messages: json                          │
│ assistant: relation  ◄── NOUVEAU        │
│ connectorId?: string                    │
│ channelId?: string                      │
└─────────────────────────────────────────┘
```

**Avantage :** Chaque conversation a son propre contexte (prompt, tools).

**Question :** Peut-on changer d'assistant en cours de conversation ?

---

## Architecture Retenue : Option C Simplifiée

### Principe

- **Assistant** = entité indépendante (LLM + prompt + tools)
- **Connector** = pointe vers l'assistant qu'il utilise
- **UI Assistants** = permet de lier des connectors existants (pas de création)

### Nouveau Modèle de Données

```typescript
// Assistant = personnalité IA réutilisable
interface AssistantRecord {
  id: string;
  name: string;
  llmProvider: string;      // relation → plugin
  llmModel: string;
  systemPrompt?: string;
  actions: string[];        // relation[] → plugins (tools)
  isDefault?: boolean;      // Utilisé par défaut dans l'UI web
}

// Plugin (connector) - le champ assistant est dans config ou comme relation
interface PluginRecord {
  id: string;
  type: string;
  name: string;
  enabled: boolean;
  config: Record<string, unknown>;
  assistant?: string;       // NEW: relation → assistant (pour connectors)
}

// Conversation = peut être liée à un assistant
interface ConversationRecord {
  id: string;
  title?: string;
  messages: LLMMessage[];
  assistant?: string;       // NEW: relation → assistant (pour l'UI web)
  connectorId?: string;
  channelId?: string;
}
```

### UI de la Page Assistants

```
┌─────────────────────────────────────────────────────────────┐
│  Assistants                                    [+ Nouveau]  │
├─────────────────────────────────────────────────────────────┤

┌─────────────────────────────────────────────────────────────┐
│  🤖 Mon Assistant Principal                      [Défaut ✓] │
├─────────────────────────────────────────────────────────────┤
│  LLM: Claude / claude-sonnet-4-20250514                     │
│  Prompt: Tu es un assistant serviable...                    │
│  Tools: web-search, home-assistant, files                   │
│                                                             │
│  📡 Connecté à:                                             │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────┐       │
│  │ 🟢 Discord     │  │ 🟡 Telegram    │  │ ➕ Lier  │       │
│  │ Mon Serveur    │  │ Bot Famille    │  │          │       │
│  │ [Délier]       │  │ [Délier]       │  └──────────┘       │
│  └────────────────┘  └────────────────┘                     │
│                                                             │
│  [Configurer]  [Supprimer]                                  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  🤖 Assistant Support                                       │
├─────────────────────────────────────────────────────────────┤
│  LLM: Ollama / llama3                                       │
│  Prompt: Tu es un agent de support technique...             │
│  Tools: files, docker                                       │
│                                                             │
│  📡 Connecté à:                                             │
│  ┌──────────┐                                               │
│  │ ➕ Lier  │  Aucun connecteur lié                         │
│  └──────────┘                                               │
│                                                             │
│  [Configurer]  [Supprimer]                                  │
└─────────────────────────────────────────────────────────────┘
```

### Dialog "Lier un connecteur"

```
┌─────────────────────────────────────────────────┐
│  Lier un connecteur                             │
├─────────────────────────────────────────────────┤
│  Connecteurs disponibles:                       │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │ 🟢 Discord - Mon Serveur        [Lier] │   │
│  │ 🟡 Telegram - Bot Famille       [Lier] │   │
│  │ 🔴 Gmail - Perso (désactivé)    [Lier] │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  Aucun connecteur disponible ?                 │
│  → Ajoutez-en un depuis la page Plugins        │
│                                                 │
│                              [Annuler]          │
└─────────────────────────────────────────────────┘
```

Note : Un connecteur déjà lié à un autre assistant n'apparaît pas (ou avec mention "Lié à X").

### Flux Utilisateur Type

**Premier setup :**
1. **Plugins** → Ajouter "Claude" (LLM provider) → Configurer API key
2. **Plugins** → Ajouter "Discord" (connector) → Configurer token
3. **Assistants** → Créer "Mon Bot" → Choisir Claude + modèle + tools
4. **Assistants** → Lier Discord à "Mon Bot"

**Utilisation UI web :**
1. **Conversations** → Nouvelle conversation
2. Choisir un assistant (ou utiliser le défaut)
3. Discuter

### Migration des Données

1. Pour chaque `AssistantRecord` existant :
   - Créer un nouvel assistant avec `name` = nom du connector lié
   - Copier `llmProvider`, `llmModel`, `systemPrompt`, `actions`
   - Mettre à jour le `PluginRecord` du connector : `assistant` = nouvel assistant ID
2. Supprimer le champ `connector` de `AssistantRecord`
3. Ajouter `assistant` optionnel sur `ConversationRecord`

---

## Décisions Prises

1. **Multi-assistant par connector ?**
   - Pour l'instant : non, 1 connector = 1 assistant
   - Future évolution possible : channelMapping dans config du connector

2. **Connecteur sans assistant ?**
   - ✅ **Répondre avec erreur** : Envoyer un message d'erreur sur le connector (ex: "Bot non configuré")
   - + Warning dans le dashboard "Connector X n'a pas d'assistant"

3. **Conversation UI web ?**
   - ✅ **Assistant par défaut** : Un assistant marqué `isDefault` est utilisé automatiquement
   - L'utilisateur peut changer d'assistant par conversation
   - Si aucun assistant par défaut → forcer le choix

4. **Changement d'assistant mid-conversation ?**
   - Autorisé (le contexte reste, seul le modèle/prompt/tools changent)

---

## Prochaines Étapes

1. [x] Valider l'architecture
2. [ ] Créer la migration PocketBase
3. [ ] Mettre à jour les types TypeScript (`shared/`)
4. [ ] Adapter le serveur (chat flow, plugin sync)
5. [ ] Refaire l'UI Assistants (liste d'assistants + liaison)
6. [ ] Ajouter le sélecteur d'assistant dans Conversations
7. [ ] Mettre à jour les traductions i18n

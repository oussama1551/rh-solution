# Fiches de Poste — Phase 1

## 1. Portée de cette phase

Cette phase définit l'architecture fonctionnelle et le futur modèle de données du module « Fiches de Poste ».
Elle ne crée aucune table et ne modifie aucune API existante.

Principes validés :

- l'employé reste référencé par `employees.id` ;
- le poste proposé lors de la création vient de `sap_employee_directory.poste` ;
- le poste SAP est copié dans la fiche au moment de sa création ;
- le poste copié peut être modifié manuellement uniquement dans cette fiche ;
- une modification dans la fiche n'écrit jamais dans SAP, l'Annuaire SAP, `employees` ou le template ;
- une fiche existante ne suit pas dynamiquement les changements ultérieurs de SAP ;
- une nouvelle fiche ou une nouvelle révision peut explicitement recharger les données RH actuelles avant la création de son snapshot.

## 2. Cartographie de l'existant

### Données réutilisées

| Besoin | Source existante | Règle |
|---|---|---|
| Employé | `employees` | Clé étrangère obligatoire, aucune duplication de table Employee |
| Matricule affiché | `local_matricule`, sinon `biotime_code`, sinon `employee_code` | Copié dans le snapshot |
| Poste SAP | `sap_employee_directory.poste` | Source prioritaire et valeur initiale seulement |
| Société | `sap_employee_directory.sap_company` | Société proposée automatiquement |
| Structure SAP | `sap_employee_directory.structure` | Copiée comme information de référence |
| Date d'embauche | `employees.hire_date`, avec SAP en repli | Copiée dans le snapshot |
| Organisation locale | `Group > SubUnit > Unit` | Copiée dans le snapshot |
| Département source | `employees.department` | Utilisé si l'organigramme est incomplet |
| Utilisateurs/validateurs | `users` | Clés étrangères vers les comptes existants |
| Permissions | `permissions`, `roles`, `role_permissions` | Étendues par de nouveaux codes |
| Audit | `audit_log` et `AuditService` | Réutilisés, pas de seconde table d'audit |
| Notifications | `notifications` | Réutilisées pour le workflow |

### Limites constatées

- aucun référentiel local normalisé des sociétés ;
- aucun référentiel des postes ;
- aucun stockage documentaire local générique ;
- aucun moteur Drag & Drop installé dans le Web ;
- PDFKit existe, mais le rendu actuel est destiné aux rapports tabulaires et non à un document A4 complexe ;
- le responsable hiérarchique n'est pas une relation fiable et normalisée dans les données locales actuelles ;
- SAP fournit un intitulé de poste libre, pas un identifiant stable de poste.

## 3. Règle de résolution du poste

Lors de l'ouverture du Wizard pour un employé :

1. rechercher le `SapEmployeeDirectory` lié par `employee_id` ;
2. prendre `poste` comme `sourceJobTitle` ;
3. rechercher un `JobPosition` par alias normalisé, société et intitulé ;
4. proposer le dernier template actif et validé de ce poste ;
5. laisser un utilisateur autorisé sélectionner un autre poste ou saisir un intitulé propre à la fiche ;
6. enregistrer simultanément la valeur SAP source et la valeur retenue.

Le snapshot conservera au minimum :

```json
{
  "source": {
    "kind": "SAP_DIRECTORY",
    "sapDirectoryId": "uuid",
    "sapJobTitle": "Responsable IT",
    "capturedAt": "2026-08-26T10:00:00Z"
  },
  "selected": {
    "jobPositionId": "uuid-ou-null",
    "jobCode": "RESPIT",
    "jobTitle": "Responsable Infrastructure IT",
    "manuallyEdited": true
  }
}
```

Une synchronisation SAP ultérieure ne modifiera pas ce JSON.

## 4. Modèle conceptuel proposé

```text
Company
 ├─ CompanyBranding
 ├─ DocumentReferenceSetting
 ├─ JobPosition
 │   ├─ JobPositionAlias
 │   └─ JobDescriptionTemplate
 │       └─ JobTemplateVersion (contenu immuable après validation)
 │
Employee (existant)
 └─ EmployeeJobDescription
     ├─ JobDescriptionVersion (snapshot complet)
     │   ├─ JobDescriptionApproval
     │   └─ JobDescriptionFile
     └─ version courante

MissionLibraryItem ──> copié dans les blocs d'un template ou d'une fiche
ApprovalWorkflow ──> ApprovalWorkflowStep
StampAsset / SignatureAsset ──> utilisation autorisée et auditée
```

## 5. Entités proposées pour la Phase 2

### `companies`

- `id` UUID ;
- `code` unique (`FABCOM`, `RECYCLAGE`, `NEWTECH`) ;
- `official_name` ;
- `short_name` ;
- adresse, téléphone, e-mail, informations légales ;
- `primary_color`, `footer_text` ;
- `is_active` ;
- dates de création et modification.

Les logos ne sont pas stockés en base64 dans cette table.

### `company_brandings`

- société ;
- type d'asset (`LOGO`, éventuellement `SECONDARY_LOGO`) ;
- chemin relatif, MIME, taille, empreinte SHA-256 ;
- nom original ;
- actif ;
- auteur et dates.

### `job_positions`

- `id`, `code`, `title` ;
- société facultative : `null` signifie poste commun ;
- direction, département et service indicatifs ;
- rattachements hiérarchique et fonctionnel par défaut ;
- actif ;
- auteur et dates ;
- unicité recommandée `(company_id, code)`.

### `job_position_aliases`

Permet d'associer les intitulés SAP libres à un poste normalisé :

- `job_position_id` ;
- `company_id` facultatif ;
- `source = SAP` ;
- `source_value` ;
- `normalized_value` indexé ;
- unicité par source, société et valeur normalisée.

Cette table évite de modifier SAP et permet de corriger progressivement les correspondances.

### `job_description_templates`

Identité stable du template :

- poste ;
- nom ;
- société facultative ;
- style visuel par défaut ;
- orientation ;
- workflow par défaut ;
- version courante validée ;
- actif/archivé ;
- auteur et dates.

### `job_template_versions`

- template parent ;
- version majeure et mineure ;
- statut documentaire ;
- `content_json` contenant les blocs structurés ;
- règles de validation JSON ;
- motif de révision ;
- auteur, validateur et dates ;
- empreinte du contenu canonique.

Une version `VALIDATED`, `OBSOLETE` ou `ARCHIVED` est immuable.

### `mission_library_items`

- catégorie ;
- code facultatif ;
- libellé, description, type ;
- fréquence, priorité, caractère essentiel ;
- KPI indicatifs ;
- société/poste facultatifs ;
- version et statut actif ;
- auteur et dates.

L'insertion dans un template ou une fiche crée une copie éditable. Elle ne conserve qu'un `sourceMissionId` de traçabilité.

### `employee_job_descriptions`

Identité logique de la fiche d'un employé :

- `employee_id` ;
- poste normalisé facultatif ;
- société ;
- version courante ;
- statut global ;
- date d'effet et date de fin ;
- référence documentaire ;
- auteur et dates.

Plusieurs fiches historiques sont autorisées pour un employé, mais une seule fiche validée active peut couvrir une date donnée.

### `job_description_versions`

Snapshot autonome et complet :

- fiche parent ;
- version majeure/mineure ;
- template et version template sources, facultatifs ;
- `employee_snapshot_json` ;
- `company_snapshot_json` ;
- `job_snapshot_json` avec poste SAP et poste retenu ;
- `content_json` ;
- statut ;
- motif de révision ;
- date d'effet ;
- auteur, finalisateur et dates ;
- empreinte du contenu canonique.

Le document final doit pouvoir être régénéré sans lire les valeurs actuelles de SAP ou de l'employé.

### `approval_workflows` et `approval_workflow_steps`

- nom, société et actif ;
- étapes ordonnées ;
- type de validateur (`MANAGER`, `ROLE`, `USER`, `EMPLOYEE`) ;
- rôle ou utilisateur ciblé ;
- signature/cachet requis ou facultatif ;
- possibilité de refus et commentaire obligatoire.

### `job_description_approvals`

- version de fiche ;
- étape ;
- statut (`PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`) ;
- validateur attendu et validateur réel ;
- commentaire ;
- dates ;
- signature/cachet utilisés, le cas échéant.

### `job_description_files`

- version ;
- type (`PDF`, plus tard `DOCX`) ;
- chemin relatif ;
- MIME, taille, SHA-256 ;
- nom d'origine ;
- date et auteur de génération.

### `document_reference_settings`

- société ;
- type documentaire ;
- pattern ;
- prochain numéro ;
- padding ;
- stratégie annuelle ou globale ;
- unicité transactionnelle de la séquence.

Pattern initial proposé :

```text
{{doc_type}}-{{company_code}}-{{department_code}}-{{job_code}}-{{sequence:3}}
```

### `stamp_assets` et `signature_assets`

Préparés dans le modèle mais désactivés fonctionnellement en V1 :

- propriétaire ou fonction ;
- fichier sécurisé ;
- empreinte ;
- actif ;
- permission nécessaire ;
- auteur et dates.

## 6. Enums proposés

```text
JobDocumentStatus:
  DRAFT | IN_REVIEW | PENDING_APPROVAL | VALIDATED | REJECTED |
  OBSOLETE | ARCHIVED

JobBlockType:
  COMPANY_HEADER | EMPLOYEE_IDENTITY | JOB_IDENTITY | PURPOSE |
  TASKS | RESPONSIBILITIES | AUTHORITIES | HIERARCHY |
  INTERNAL_RELATIONS | EXTERNAL_RELATIONS | KPI | OBJECTIVES |
  TECHNICAL_SKILLS | BEHAVIORAL_SKILLS | EDUCATION | EXPERIENCE |
  CERTIFICATIONS | TOOLS | EQUIPMENT | WORK_CONDITIONS |
  SCHEDULE | TRAVEL | HSE_RISKS | PPE | CONFIDENTIALITY |
  DELEGATION | OBSERVATIONS | REVISION_HISTORY | SIGNATURES |
  FREE_TEXT | SEPARATOR | CUSTOM_TABLE | CUSTOM

JobTaskFrequency:
  DAILY | WEEKLY | MONTHLY | QUARTERLY | YEARLY | OCCASIONAL |
  AS_NEEDED
```

## 7. Contrat JSON du Builder

Le format doit être versionné indépendamment de la version documentaire :

```ts
type JobBuilderDocument = {
  schemaVersion: 1;
  page: {
    format: "A4";
    orientation: "portrait" | "landscape";
    visualTheme: "corporate" | "compact" | "modern" | "iso";
  };
  blocks: JobBuilderBlock[];
};

type JobBuilderBlock = {
  id: string;
  type: JobBlockType;
  order: number;
  title: string;
  visible: boolean;
  required: boolean;
  editable: boolean;
  removable: boolean;
  pageBreakBefore: boolean;
  style: Record<string, string | number | boolean>;
  content: unknown;
};
```

Une tâche est un objet :

```ts
type JobTask = {
  id: string;
  sourceMissionId?: string;
  label: string;
  description?: string;
  taskType?: string;
  essential: boolean;
  frequency?: JobTaskFrequency;
  priority?: number;
  weightPercent?: number;
  linkedKpiIds: string[];
  comment?: string;
};
```

Un KPI est également structuré avec nom, description, unité, cible facultative, fréquence, source et responsable du suivi.

## 8. Variables dynamiques

Le moteur utilisera un registre explicite, pas une évaluation JavaScript libre.

Namespaces initiaux :

- `employee.matricule`, `employee.full_name`, `employee.hire_date` ;
- `employee.unit`, `employee.sub_unit`, `employee.group` ;
- `job.source_sap_title`, `job.title`, `job.code` ;
- `company.name`, `company.code`, `company.logo` ;
- `document.reference`, `document.version`, `document.effective_date` ;
- `manager.full_name`, `manager.job_title`.

Chaque variable possède : code, libellé, type, fonction de résolution et politique si absente. Les variables inconnues sont signalées et jamais exécutées.

## 9. Versionnement et immutabilité

- un brouillon peut être modifié en place avec autosave ;
- la finalisation fige le snapshot et le contenu ;
- une version validée ne peut plus être modifiée ;
- « Réviser » crée une copie vers une nouvelle version ;
- le changement majeur/mineur et le motif sont obligatoires ;
- la version précédente est conservée ;
- une comparaison se fait sur le JSON canonique des blocs, tâches, KPI et snapshots ;
- le PDF archivé est lié à une version précise et contrôlé par SHA-256.

## 10. Permissions et rôles cibles

Permissions à ajouter ultérieurement :

- `job_description.view`
- `job_description.create`
- `job_description.edit`
- `job_description.archive`
- `job_description.validate`
- `job_description.generate`
- `job_template.manage`
- `mission_library.manage`
- `company_branding.manage`
- `stamp.manage`
- `signature.manage`

Attribution initiale proposée :

| Rôle | Accès proposé |
|---|---|
| Admin | Tous les droits |
| DRH | Voir, créer, éditer, valider, générer, gérer templates et missions |
| GRH | Voir, créer, éditer et générer selon workflow ; pas de cachet/signature |
| Responsable | Voir son périmètre et proposer des modifications si activé |
| Employé | Hors périmètre V1 ; futur portail limité à ses versions validées |

## 11. Sécurité documentaire

- aucune image de signature/cachet dans le répertoire public du Web ;
- téléchargements via une API contrôlée par permission ;
- validation stricte MIME/taille/type d'image ;
- noms de fichiers générés côté serveur ;
- chemins relatifs contrôlés, aucun chemin fourni par le client ;
- empreinte SHA-256 des fichiers officiels ;
- audit de création, lecture sensible, validation, génération et utilisation d'asset ;
- archivage au lieu de suppression pour les versions officielles.

## 12. Fichiers prévus pour la Phase 2

Nouveaux fichiers API :

```text
apps/api/src/job-descriptions/job-descriptions.module.ts
apps/api/src/job-descriptions/job-descriptions.controller.ts
apps/api/src/job-descriptions/job-descriptions.service.ts
apps/api/src/job-descriptions/job-templates.controller.ts
apps/api/src/job-descriptions/job-templates.service.ts
apps/api/src/job-descriptions/companies.controller.ts
apps/api/src/job-descriptions/companies.service.ts
apps/api/src/job-descriptions/dto/*.ts
apps/api/src/job-descriptions/job-description.types.ts
apps/api/src/job-descriptions/job-variable-registry.ts
apps/api/test/job-descriptions.service.spec.ts
apps/api/test/job-templates.service.spec.ts
```

Fichiers existants à modifier en Phase 2 :

```text
apps/api/prisma/schema.prisma
apps/api/prisma/migrations/<timestamp>_add_job_descriptions/migration.sql
apps/api/src/app.module.ts
apps/api/src/permissions/permission-codes.ts
apps/api/src/roles/default-roles.ts
apps/api/src/administration/administration.service.ts
apps/api/src/users ou relations Prisma User selon les relations ajoutées
apps/api/src/employees/employees.service.ts (historique, seulement quand l'API est prête)
```

Le Web ne sera modifié qu'à partir de la Phase 3. Les futurs points d'intégration seront `App.tsx`, `AppShell.tsx`, `lib/types.ts`, la fiche employé et de nouvelles pages dédiées.

## 13. Découpage recommandé de la migration

Pour limiter le risque, la Phase 2 ne doit pas créer immédiatement signatures/cachets numériques ni fichiers PDF. Première migration :

1. sociétés et branding logo ;
2. postes et alias SAP ;
3. templates et versions ;
4. missions ;
5. fiches individuelles et versions ;
6. workflows et approbations ;
7. paramètres de références.

Les tables d'assets sensibles et d'archives PDF peuvent être ajoutées avec la Phase 7, après validation du stockage VM.

## 14. Checklist de validation de la Phase 1

- [x] La table Employee existante est réutilisée.
- [x] Le poste proposé vient de l'Annuaire SAP.
- [x] Le poste SAP est un snapshot non dynamique.
- [x] Le poste peut être modifié uniquement pour la fiche.
- [x] Aucun changement de fiche ne modifie SAP ou le template.
- [x] Template et fiche individuelle sont séparés.
- [x] Les versions validées sont immuables.
- [x] Missions et KPI sont structurés.
- [x] Le contenu du Builder est versionné.
- [x] Les sociétés et logos sont configurables.
- [x] Les permissions et règles de sécurité sont identifiées.
- [x] Les fichiers de la Phase 2 sont identifiés.
- [ ] Confirmer la source/règle du responsable hiérarchique.
- [ ] Confirmer le stockage futur des logos et documents sur la VM.
- [ ] Confirmer l'attribution finale des permissions GRH/Responsable.
- [ ] Valider ce modèle avant création de la migration Phase 2.

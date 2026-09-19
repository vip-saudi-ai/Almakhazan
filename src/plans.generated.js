// GENERATED FILE — edit shared/plans.json and run `npm run sync:plans`.

export const PLAN_CONFIG = {
  "$comment": "Canonical plan and entitlement configuration. Edit ONLY this file, then run `npm run sync:plans` to regenerate the browser and Cloud Functions copies. Prices are placeholders pending a business decision and are not wired to any payment provider yet.",
  "schemaVersion": 1,
  "defaultPlan": "free",
  "trialDays": 14,
  "trialPlan": "pro",
  "retention": {
    "readOnlyGraceDays": 14,
    "deleteAfterDays": 90
  },
  "plans": {
    "free": {
      "id": "free",
      "order": 0,
      "name": {
        "ar": "المجانية",
        "en": "Free"
      },
      "price": {
        "monthly": 0,
        "yearly": 0,
        "currency": "SAR"
      },
      "purchasable": false,
      "limits": {
        "items": 50,
        "storageBytes": 524288000,
        "members": 1,
        "workspaces": 1,
        "imagesPerItem": 5,
        "aiCreditsMonthly": 3,
        "trashRetentionDays": 14,
        "activityRetentionDays": 30
      },
      "features": {
        "exportJson": true,
        "exportExcel": false,
        "import": true,
        "bulkActions": false,
        "qrLabels": false,
        "sharing": false,
        "customFields": false
      }
    },
    "personal": {
      "id": "personal",
      "order": 1,
      "name": {
        "ar": "الشخصية",
        "en": "Personal"
      },
      "price": {
        "monthly": 19,
        "yearly": 190,
        "currency": "SAR"
      },
      "purchasable": true,
      "limits": {
        "items": 1000,
        "storageBytes": 5368709120,
        "members": 1,
        "workspaces": 1,
        "imagesPerItem": 12,
        "aiCreditsMonthly": 20,
        "trashRetentionDays": 30,
        "activityRetentionDays": 180
      },
      "features": {
        "exportJson": true,
        "exportExcel": true,
        "import": true,
        "bulkActions": true,
        "qrLabels": true,
        "sharing": false,
        "customFields": false
      }
    },
    "pro": {
      "id": "pro",
      "order": 2,
      "name": {
        "ar": "الاحترافية",
        "en": "Pro"
      },
      "price": {
        "monthly": 49,
        "yearly": 490,
        "currency": "SAR"
      },
      "purchasable": true,
      "limits": {
        "items": 10000,
        "storageBytes": 26843545600,
        "members": 3,
        "workspaces": 3,
        "imagesPerItem": 12,
        "aiCreditsMonthly": 100,
        "trashRetentionDays": 60,
        "activityRetentionDays": 365
      },
      "features": {
        "exportJson": true,
        "exportExcel": true,
        "import": true,
        "bulkActions": true,
        "qrLabels": true,
        "sharing": true,
        "customFields": true
      }
    },
    "team": {
      "id": "team",
      "order": 3,
      "name": {
        "ar": "الفريق",
        "en": "Team"
      },
      "price": {
        "monthly": 149,
        "yearly": 1490,
        "currency": "SAR"
      },
      "purchasable": true,
      "limits": {
        "items": 100000,
        "storageBytes": 107374182400,
        "members": 25,
        "workspaces": 10,
        "imagesPerItem": 12,
        "aiCreditsMonthly": 500,
        "trashRetentionDays": 90,
        "activityRetentionDays": 730
      },
      "features": {
        "exportJson": true,
        "exportExcel": true,
        "import": true,
        "bulkActions": true,
        "qrLabels": true,
        "sharing": true,
        "customFields": true
      }
    }
  }
};

// GENERATED FILE — edit shared/plans.json and run `npm run sync:plans`.

export const PLAN_CONFIG = {
  "$comment": "Canonical plan and entitlement configuration. Edit ONLY this file, then run `npm run sync:plans` to regenerate the browser and Cloud Functions copies. Item limits count inventory RECORDS, never quantities: one record with quantity 500 costs one. Annual prices are explicit commercial figures, never derived from the monthly ones. priceVersion exists so a future price change can leave existing subscribers on the terms they bought.",
  "schemaVersion": 2,
  "defaultPlan": "free",
  "trialDays": 0,
  "trialPlan": "pro",
  "currency": "SAR",
  "retention": {
    "readOnlyGraceDays": 14,
    "deleteAfterDays": 90
  },
  "usageWarnings": {
    "noticeAt": 0.7,
    "warnAt": 0.9
  },
  "plans": {
    "free": {
      "id": "free",
      "order": 0,
      "name": {
        "ar": "مجاني",
        "en": "Free"
      },
      "tagline": {
        "ar": "ابدأ بدون بطاقة بنكية",
        "en": "Start with no card"
      },
      "price": {
        "monthly": 0,
        "yearly": 0,
        "currency": "SAR"
      },
      "purchasable": false,
      "badge": null,
      "limits": {
        "items": 50,
        "storageBytes": 1073741824,
        "members": 1,
        "workspaces": 1,
        "imagesPerItem": 5,
        "aiCreditsMonthly": 10,
        "bulkAiPerJob": 0,
        "importRows": 200,
        "trashRetentionDays": 14,
        "activityRetentionDays": 30
      },
      "assistant": {
        "display": "counted",
        "label": {
          "ar": "10 إجراءات شهرياً",
          "en": "10 actions / month"
        }
      },
      "features": {
        "exportJson": true,
        "exportExcel": true,
        "import": true,
        "bulkActions": false,
        "bulkAi": false,
        "advancedImport": false,
        "advancedReports": false,
        "teamFeatures": false,
        "qrLabels": true,
        "sharing": false,
        "customFields": false
      },
      "priceVersion": "2026-09-nazm-1"
    },
    "personal": {
      "id": "personal",
      "order": 1,
      "name": {
        "ar": "شخصي",
        "en": "Personal"
      },
      "tagline": {
        "ar": "لمقتنياتك الخاصة",
        "en": "For your own collection"
      },
      "price": {
        "monthly": 69,
        "yearly": 690,
        "currency": "SAR"
      },
      "purchasable": true,
      "badge": null,
      "limits": {
        "items": 1000,
        "storageBytes": 5368709120,
        "members": 1,
        "workspaces": 1,
        "imagesPerItem": 12,
        "aiCreditsMonthly": 300,
        "bulkAiPerJob": 0,
        "importRows": 2000,
        "trashRetentionDays": 30,
        "activityRetentionDays": 180
      },
      "assistant": {
        "display": "included",
        "label": {
          "ar": "مشمول",
          "en": "Included"
        }
      },
      "features": {
        "exportJson": true,
        "exportExcel": true,
        "import": true,
        "bulkActions": true,
        "bulkAi": false,
        "advancedImport": false,
        "advancedReports": false,
        "teamFeatures": false,
        "qrLabels": true,
        "sharing": false,
        "customFields": false
      },
      "priceVersion": "2026-09-nazm-1"
    },
    "pro": {
      "id": "pro",
      "order": 2,
      "name": {
        "ar": "احترافي",
        "en": "Pro"
      },
      "tagline": {
        "ar": "للفرق والمجموعات الكبيرة",
        "en": "For teams and large collections"
      },
      "price": {
        "monthly": 159,
        "yearly": 1590,
        "currency": "SAR"
      },
      "purchasable": true,
      "badge": {
        "ar": "الأكثر شعبية",
        "en": "Most popular"
      },
      "limits": {
        "items": 5000,
        "storageBytes": 26843545600,
        "members": 3,
        "workspaces": 3,
        "imagesPerItem": 12,
        "aiCreditsMonthly": 1500,
        "bulkAiPerJob": 50,
        "importRows": 10000,
        "trashRetentionDays": 60,
        "activityRetentionDays": 365
      },
      "assistant": {
        "display": "included",
        "label": {
          "ar": "مشمول",
          "en": "Included"
        }
      },
      "features": {
        "exportJson": true,
        "exportExcel": true,
        "import": true,
        "bulkActions": true,
        "bulkAi": true,
        "advancedImport": true,
        "advancedReports": true,
        "teamFeatures": true,
        "qrLabels": true,
        "sharing": true,
        "customFields": true
      },
      "priceVersion": "2026-09-nazm-1"
    },
    "business": {
      "id": "business",
      "order": 3,
      "name": {
        "ar": "أعمال",
        "en": "Business"
      },
      "tagline": {
        "ar": "للمستودعات والمتاجر",
        "en": "For warehouses and stores"
      },
      "price": {
        "monthly": 279,
        "yearly": 2790,
        "currency": "SAR"
      },
      "purchasable": true,
      "badge": null,
      "limits": {
        "items": 20000,
        "storageBytes": 107374182400,
        "members": 10,
        "workspaces": 10,
        "imagesPerItem": 12,
        "aiCreditsMonthly": 6000,
        "bulkAiPerJob": 200,
        "importRows": 50000,
        "trashRetentionDays": 90,
        "activityRetentionDays": 730
      },
      "assistant": {
        "display": "included",
        "label": {
          "ar": "مشمول",
          "en": "Included"
        }
      },
      "features": {
        "exportJson": true,
        "exportExcel": true,
        "import": true,
        "bulkActions": true,
        "bulkAi": true,
        "advancedImport": true,
        "advancedReports": true,
        "teamFeatures": true,
        "qrLabels": true,
        "sharing": true,
        "customFields": true
      },
      "priceVersion": "2026-09-nazm-1"
    },
    "enterprise": {
      "id": "enterprise",
      "order": 4,
      "name": {
        "ar": "مؤسسات",
        "en": "Enterprise"
      },
      "tagline": {
        "ar": "حدود مخصصة ودعم مخصص",
        "en": "Custom limits and dedicated support"
      },
      "price": {
        "monthly": null,
        "yearly": null,
        "currency": "SAR",
        "custom": {
          "ar": "حسب الاتفاق",
          "en": "Contact us"
        }
      },
      "purchasable": false,
      "contactOnly": true,
      "badge": null,
      "limits": {
        "items": -1,
        "storageBytes": -1,
        "members": -1,
        "workspaces": -1,
        "imagesPerItem": 24,
        "aiCreditsMonthly": -1,
        "bulkAiPerJob": 500,
        "importRows": -1,
        "trashRetentionDays": 180,
        "activityRetentionDays": 1095
      },
      "assistant": {
        "display": "included",
        "label": {
          "ar": "مشمول",
          "en": "Included"
        }
      },
      "features": {
        "exportJson": true,
        "exportExcel": true,
        "import": true,
        "bulkActions": true,
        "bulkAi": true,
        "advancedImport": true,
        "advancedReports": true,
        "teamFeatures": true,
        "qrLabels": true,
        "sharing": true,
        "customFields": true
      },
      "priceVersion": "2026-09-nazm-1",
      "limitsLabel": {
        "ar": "حدود مخصصة",
        "en": "Custom limits"
      }
    }
  },
  "priceVersion": "2026-09-nazm-1",
  "entitlementsVersion": 2,
  "annualNote": {
    "ar": "شهران مجاناً مع الاشتراك السنوي",
    "en": "Two months free on annual billing"
  }
};

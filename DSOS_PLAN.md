# 🎯 Digital Services Operating System (DSOS)

## خطة هندسية وتجارية وتقنية كاملة من الصفر حتى الإطلاق

---

# 1. 🧠 تحليل المشروع (Business Model)

## كيف يربح المشروع؟

**نموذج هامش الربح (Margin Model):**
- تشتري الخدمة من المورد بسعر دولار (USD)
- تبيعها للزبون الجزائري بالدينار (DZD)
- الفرق = هامش الربح

**مثال واقعي:**
| الخدمة | تكلفتك (USD) | سعر البيع (DZD) | هامش الربح |
|--------|-------------|-----------------|-----------|
| ChatGPT Plus | $20 | 4,000 DZD | ~1,000 DZD |
| Netflix Premium | $15 | 2,500 DZD | ~500 DZD |
| Canva Pro | $12 | 2,000 DZD | ~350 DZD |
| YouTube Premium | $18 | 3,000 DZD | ~600 DZD |

**السعر بالدينار = (سعر الدولار × سعر الصرف) + هامش الربح**
مثال: ChatGPT ($20 × 145) + 1,000 = 3,900 DZD

## كيف يتم تنفيذ الطلبات؟

```
زبون يطلب → يؤكد الدفع → المدير يستلم إشعار → يفتح "Execution Guide" → 
يتبع التعليمات خطوة بخطوة → يضع كلمة السر في "Smart Notes" →
يحدد الطلب مكتمل → الزبون يستلم الخدمة
```

## مصادر الإيرادات الإضافية

1. **Reseller System (لاحقاً)**: تسمح للبائعين بالبيع عبر منصتك + عمولة 10-15%
2. **API Access (لاحقاً)**: شركات تشتري API للربط الآلي
3. **Subscription Plans**: باقات شهرية للخدمات الأكثر طلباً
4. **Bulk Discounts**: خصم للطلبات الكبيرة

## المخاطر القانونية في السوق الجزائري

- **بيع الحسابات المشتركة**: قد يخالف شروط استخدام الخدمات
- **الدفع الإلكتروني**: لا يوجد حل دفع إلكتروني جزائري متكامل (CCP هو الحل)
- **الحل**: استخدام نظام "وسيط خدمات" وليس بائع حسابات — تقوم بتنفيذ الخدمة نيابة عن العميل

---

# 2. 🏗️ Architecture التقنية الكاملة

## Stack المقترح

```
Frontend (SPA)        → React + TypeScript + Tailwind CSS + Vite
Backend (API)         → Node.js + Express + TypeScript
Database              → SQLite (MVP) → PostgreSQL (Production)
ORM                   → Prisma
Auth                  → JWT + bcrypt
Admin Panel           → نفس التطبيق (Role-based routes)
Payments              → CCP / Baridimob / Bank Transfer (Proof-based)
Deployment            → Railway.app / Fly.io / VPS OVH (€3.5)
File Storage          → Local disk → Cloudinary/S3
```

## لماذا هذا الstack؟

- **مطور واحد** → TypeScript everywhere (تقليل ال context switching)
- **SQLite في البداية** → لا تحتاج سيرفر DB، كل شيء في ملف واحد
- **Prisma** → أسهل ORM للتعامل مع SQLite والترقية لـ PostgreSQL
- **Tailwind** → أسرع طريقة لعمل UI احترافي بدون مكتبات إضافية

## هيكل المشروع

```
dsos/
├── src/
│   ├── server/
│   │   ├── index.ts          # Express server
│   │   ├── routes/
│   │   │   ├── auth.ts
│   │   │   ├── orders.ts
│   │   │   ├── products.ts
│   │   │   ├── payments.ts
│   │   │   ├── admin.ts
│   │   │   └── customers.ts
│   │   ├── middleware/
│   │   │   ├── auth.ts
│   │   │   └── admin.ts
│   │   ├── services/
│   │   │   ├── execution.ts   # Execution Engine
│   │   │   └── payment.ts
│   │   └── db.ts              # Prisma client
│   ├── client/
│   │   ├── pages/
│   │   │   ├── Login.tsx
│   │   │   ├── Register.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   ├── NewOrder.tsx
│   │   │   ├── OrderDetails.tsx
│   │   │   └── admin/
│   │   │       ├── Orders.tsx
│   │   │       ├── OrderExecute.tsx
│   │   │       ├── Products.tsx
│   │   │       ├── Customers.tsx
│   │   │       └── Reports.tsx
│   │   └── components/
│   │       ├── Layout.tsx
│   │       ├── OrderCard.tsx
│   │       └── StatusBadge.tsx
│   └── shared/
│       └── types.ts
├── prisma/
│   └── schema.prisma
├── .env
└── package.json
```

## نظام الأمان

- **JWT tokens** مع صلاحية 24 ساعة
- **Refresh tokens** للتجديد التلقائي
- **Admin routes**: middleware يتحقق من role `admin`
- **Input validation**: Zod على كل API
- **Rate limiting**: express-rate-limit
- **File upload**: فحص نوع الملف والحجم
- **CORS**: مقيد بـ domain واحد فقط

---

# 3. 🗄️ تصميم قاعدة البيانات (Full Schema)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"     // MVP
  url      = env("DATABASE_URL")
}

// ========================
// 👤 المستخدمين
// ========================
model User {
  id        String   @id @default(uuid())
  name      String
  phone     String   @unique    // الجزائر: الرقم كمعرّف
  email     String?
  password  String
  role      String   @default("customer") // "customer" | "admin" | "staff"
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  orders         Order[]
  paymentProofs  PaymentProof[]
  activityLogs   ActivityLog[]
}

// ========================
// 📦 المنتجات (الخدمات)
// ========================
model Product {
  id          String   @id @default(uuid())
  name        String                      // "ChatGPT Plus"
  slug        String   @unique            // "chatgpt-plus"
  category    String                      // "AI Tools" | "Streaming" | "Design" | "Cloud"
  description String                      // وصف الخدمة
  priceDZD    Float                       // سعر البيع بالدينار
  costUSD     Float                       // التكلفة بالدولار (يخفي عن الزبون)
  isActive    Boolean  @default(true)
  sortOrder   Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  executionGuide ExecutionGuide?  // تعليمات التنفيذ (1:1)
  orders         Order[]
}

// ========================
// 📋 تعليمات تنفيذ المنتج
// ========================
model ExecutionGuide {
  id          String   @id @default(uuid())
  productId   String   @unique
  product     Product  @relation(fields: [productId], references: [id])
  steps       String                  // JSON array of ExecutionStep (انظر الأسفل)
  notes       String?                 // نصائح عامة للتنفيذ
  warnings    String?                 // تحذيرات مهمة
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  // steps مثال:
  // [
  //   { "order": 1, "title": "فتح الموقع", "instruction": "...", "type": "link" },
  //   { "order": 2, "title": "تسجيل الدخول", "instruction": "...", "type": "credential" },
  //   { "order": 3, "title": "إضافة البطاقة", "instruction": "...", "type": "instruction" }
  // ]
}

// ========================
// 📄 الطلبات
// ========================
model Order {
  id          String   @id @default(uuid())
  orderNumber Int      @default(autoincrement()) // رقم الطلب للزبون
  productId   String
  product     Product  @relation(fields: [productId], references: [id])
  customerId  String
  customer    User     @relation(fields: [customerId], references: [id])
  status      String   @default("pending")
  // حالات الطلب:
  // pending → awaiting_payment → payment_review → in_execution → completed
  // pending → cancelled
  // awaiting_payment → cancelled
  // payment_review → rejected → awaiting_payment
  // in_execution → completed
  // completed → refunded

  customerNotes String?        // ملاحظات الزبون (مثال: "عايز الحساب بالإيميل هذا")
  adminNotes    String?        // ملاحظات المدير (داخلية)
  smartNotes    String?        // كلمات سر وبيانات حساسة (مشفر)
  executedBy    String?        // ID الموظف المنفذ
  executedAt    DateTime?
  completedAt   DateTime?
  profitDZD     Float?         // ربح هذا الطلب (محسوب تلقائياً)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  payment          Payment?
  executionHistory ExecutionHistory[]
  activityLogs     ActivityLog[]
}

// لكل خطوة في التنفيذ يتم تسجيلها
model ExecutionHistory {
  id        String   @id @default(uuid())
  orderId   String
  order     Order    @relation(fields: [orderId], references: [id])
  stepOrder Int                  // رقم الخطوة من ExecutionGuide
  stepTitle String               // عنوان الخطوة
  status    String   @default("pending") // "pending" | "done" | "skipped"
  note      String?              // ملاحظة المنفذ
  createdAt DateTime @default(now())
}

// ========================
// 💳 الدفعات
// ========================
model Payment {
  id            String   @id @default(uuid())
  orderId       String   @unique
  order         Order    @relation(fields: [orderId], references: [id])
  amountDZD     Float
  method        String                  // "ccp" | "baridimob" | "bank_transfer"
  status        String   @default("pending") // "pending" | "review" | "confirmed" | "rejected"
  adminNotes    String?                 // سبب الرفض مثلاً
  confirmedBy   String?                 // المسؤول الذي أكد الدفع
  confirmedAt   DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  proofs PaymentProof[]
}

// إثباتات الدفع (صور التحويل)
model PaymentProof {
  id        String   @id @default(uuid())
  paymentId String
  payment   Payment  @relation(fields: [paymentId], references: [id])
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  filePath  String                // مسار الصورة
  notes     String?
  createdAt DateTime @default(now())
}

// ========================
// 📊 سجل النشاطات
// ========================
model ActivityLog {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  orderId   String?
  order     Order?   @relation(fields: [orderId], references: [id])
  action    String              // "order.created" | "payment.confirmed" | "order.completed"
  details   String?             // JSON مع تفاصيل إضافية
  createdAt DateTime @default(now())
}
```

---

# 4. 🧩 نظام Execution Engine

هذا **أهم جزء في المشروع**. يضمن أن أي موظف (حتى لو جديد) يستطيع تنفيذ أي طلب بشكل احترافي.

## هيكل Execution Guide

كل منتج عنده `ExecutionGuide` يحتوي على:

```typescript
interface ExecutionStep {
  order: number
  title: string           // عنوان الخطوة (مختصر)
  instruction: string     // شرح مفصل للخطوة
  type: 'link' | 'credential' | 'instruction' | 'check' | 'wait'
  optional?: boolean      // هل الخطوة اختيارية؟
  warning?: string        // تحذير (يظهر باللون الأحمر)
}

interface ExecutionGuide {
  steps: ExecutionStep[]
  notes?: string          // نصائح عامة
  warnings?: string       // تحذيرات عامة
}
```

## مثال واقعي: ChatGPT Plus

```json
{
  "steps": [
    {
      "order": 1,
      "title": "فتح موقع OpenAI",
      "instruction": "افتح https://chat.openai.com في متصفح عادي (لا تستخدم VPN للشراء)",
      "type": "link"
    },
    {
      "order": 2,
      "title": "إنشاء حساب",
      "instruction": "استخدم الإيميل الجديد (info+1@...). كلمة السر: استخدم المولد التلقائي في Smart Notes",
      "type": "instruction"
    },
    {
      "order": 3,
      "title": "التحقق من الإيميل",
      "instruction": "افتح الإيميل المؤقت (رابط SMTP في Smart Notes). اضغط على رابط التفعيل",
      "type": "check"
    },
    {
      "order": 4,
      "title": "إضافة البطاقة",
      "instruction": "اذهب إلى Settings → Billing → Add payment. استخدم بيانات البطاقة من Smart Notes",
      "type": "credential",
      "warning": "تأكد أن عنوان الفوترة يطابق عنوان البطاقة"
    },
    {
      "order": 5,
      "title": "الاشتراك في Plus",
      "instruction": "اختر ChatGPT Plus → Confirm. تأكد أن الشاشة تظهر 'You are now a Plus subscriber'",
      "type": "check"
    },
    {
      "order": 6,
      "title": "حفظ البيانات",
      "instruction": "ضع الإيميل وكلمة السر في Smart Notes. ضع تاريخ التجديد. ضع رابط الحساب",
      "type": "instruction"
    }
  ],
  "notes": "نفضل استخدام Gmail مع نقطة (.) لتوليد إيميلات غير محدودة: example+1@gmail.com",
  "warnings": "⚠️ لا تشترك من VPN أمريكي إذا كانت البطاقة جزائرية. استخدم VPN دولة البطاقة"
}
```

## State Machine Diagram

```
                    ┌─────────────┐
                    │   PENDING   │
                    └──────┬──────┘
                           │
                    ┌──────▼──────────┐
              ┌─────┤ AWAITING_PAYMENT ├─────┐
              │     └──────┬──────────┘     │
              │            │                │
       ┌──────▼────┐ ┌────▼─────┐          │
       │ CANCELLED │ │PAYMENT_  │          │
       └───────────┘ │  REVIEW  │          │
                     └────┬─────┘          │
                          │                │
                    ┌─────▼──────┐         │
                    │  REJECTED  │         │
                    └─────┬──────┘         │
                          │                │
                          ▼                │
                    ┌─────────────┐        │
                    │IN_EXECUTION │◄───────┘
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  COMPLETED  │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  REFUNDED   │
                    └─────────────┘
```

## Smart Notes

نظام خاص بالملاحظات الحساسة: كلمات السر، بيانات الحسابات، روابط SMTP، إلخ.

```
┌─────────────────────────────────────────────┐
│  📝 Smart Notes - الطلب #42                  │
├─────────────────────────────────────────────┤
│                                             │
│  🔑 بيانات الحساب:                          │
│  إيميل: client123@gmail.com                 │
│  كلمة السر: G7x!mK9#pQ2                     │
│                                             │
│  💳 بيانات الدفع:                            │
│  البطاقة: 4242 4242 4242 4242               │
│  الانتهاء: 12/26 ●● CVC: 123                │
│                                             │
│  📎 روابط:                                  │
│  SMTP: https://temp-mail.org/abc123         │
│  الحساب: https://chat.openai.com/...        │
│                                             │
│  📅 تاريخ التجديد: 15/05/2026               │
│                                             │
│  [🔒 Encrypted - فقط المشرف والمنفذ]         │
└─────────────────────────────────────────────┘
```

## ExecutionEngine Service (كود)

```typescript
// src/server/services/execution.ts

interface ExecutionStep {
  order: number
  title: string
  instruction: string
  type: 'link' | 'credential' | 'instruction' | 'check' | 'wait'
  optional?: boolean
  warning?: string
}

export class ExecutionEngine {
  // جلب التعليمات الخاصة بالمنتج
  async getGuide(productId: string): Promise<ExecutionGuide> { ... }

  // بدء التنفيذ (إنشاء ExecutionHistory entries)
  async startExecution(orderId: string, userId: string): Promise<void> {
    const order = await prisma.order.findUnique({ where: { id: orderId } })
    const guide = await this.getGuide(order.productId)
    const steps: ExecutionStep[] = JSON.parse(guide.steps)
    
    // إنشاء سجل لكل خطوة
    for (const step of steps) {
      await prisma.executionHistory.create({
        data: {
          orderId,
          stepOrder: step.order,
          stepTitle: step.title,
          status: 'pending'
        }
      })
    }
    
    // تحديث حالة الطلب
    await prisma.order.update({
      where: { id: orderId },
      data: { 
        status: 'in_execution',
        executedBy: userId
      }
    })
  }

  // تحديث حالة خطوة
  async updateStep(historyId: string, status: string, note?: string) { ... }

  // إكمال الطلب
  async completeOrder(orderId: string) { ... }
}
```

---

# 5. 🎛️ Admin Dashboard كامل

## شاشة الطلبات (Orders Queue)

```
┌─────────────────────────────────────────────────────────────────┐
│  📋 الطلبات                                                     │
│                                                                 │
│  [🔍 بحث...]  [الكل] [قيد الانتظار] [قيد التنفيذ] [مكتمل]       │
│                                                                 │
│  ┌────┬────────────────┬──────────┬──────────┬────────┬──────┐  │
│  │ #  │ المنتج          │ الزبون   │ المبلغ   │ الحالة │    │  │
│  ├────┼────────────────┼──────────┼──────────┼────────┼──────┤  │
│  │ 42 │ ChatGPT Plus   │ أحمد    │ 3,900    │ ⏳ جاري │ تنفيذ│  │
│  │ 41 │ Netflix Premium│ سارة    │ 2,500    │ ✅ تم   │ عرض  │  │
│  │ 40 │ Canva Pro      │ محمد    │ 2,000    │ 💳 تأكيد│     │  │
│  │ 39 │ YouTube Premium│ خالد    │ 3,000    │ ❌ ملغي │     │  │
│  └────┴────────────────┴──────────┴──────────┴────────┴──────┘  │
│                                                                 │
│  [< 1 2 3 4 5 >]                                                │
└─────────────────────────────────────────────────────────────────┘
```

## صفحة تنفيذ الطلب (Execution Page)

```
┌─────────────────────────────────────────────────────────────────┐
│  الطلب #42 | ChatGPT Plus | الزبون: أحمد                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─── معلومات الطلب ─────────────────────────────────────────┐ │
│  │  📅 الإنشاء: 15/04/2026 14:30                              │ │
│  │  💰 المبلغ: 3,900 DZD | الربح: 1,000 DZD                   │ │
│  │  📝 ملاحظة الزبون: "عايز الاشتراك لمدة شهر واحد"           │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌─── Execution Guide ───────────────────────────────────────┐ │
│  │                                                           │ │
│  │  ☐ 1. فتح موقع OpenAI                                    │ │
│  │     → https://chat.openai.com                            │ │
│  │     [فتح الرابط]                                         │ │
│  │                                                           │ │
│  │  ☑ 2. إنشاء حساب  [✅ تم]                                │ │
│  │     → استخدم الإيميل: info+1@gmail.com                   │ │
│  │                                                           │ │
│  │  ☐ 3. التحقق من الإيميل                                  │ │
│  │     → [انتظار تأكيد...]                                   │ │
│  │                                                           │ │
│  │  ⚠️ تحذير: لا تستخدم VPN أمريكي                          │ │
│  │                                                           │ │
│  │  [☑️ تأكيد إتمام الخطوة] [⏭️ تخطي] [💬 إضافة ملاحظة]      │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌─── Smart Notes ───────────────────────────────────────────┐ │
│  │  [🔒 مشفر - أنت فقط تراه]                                  │ │
│  │  الإيميل: ______________                                   │ │
│  │  كلمة السر: ______________                                 │ │
│  │  [حفظ]                                                     │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  [✅ إكمال الطلب] [❌ إلغاء الطلب] [↩️ طلب مراجعة]              │
└─────────────────────────────────────────────────────────────────┘
```

## التقارير والأرباح

```
┌─────────────────────────────────────────────────────────────────┐
│  📊 التقارير                                                    │
│                                                                 │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐               │
│  │  إجمالي  │ │  هذا    │ │  أمس    │ │  هذا    │               │
│  │  المبيعات│ │  الشهر  │ │         │ │  الأسبوع│               │
│  │  450,000 │ │ 120,000 │ │ 35,000  │ │ 85,000  │               │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘               │
│                                                                 │
│  صافي الربح: 89,000 DZD هذا الشهر                              │
│  الهامش: 23%                                                   │
│                                                                 │
│  ┌─── أكثر الخدمات مبيعاً ───────────────────────┐              │
│  │  ChatGPT Plus     ████████████  42 طلب       │              │
│  │  Netflix Premium  ████████      28 طلب       │              │
│  │  Canva Pro        ██████        20 طلب       │              │
│  │  YouTube Premium  █████         15 طلب       │              │
│  └───────────────────────────────────────────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

---

# 6. 💳 نظام الدفع

## طرق الدفع في السوق الجزائري

| الطريقة | الحالة | الميزة |
|---------|--------|--------|
| **CCP (Clearing)** | ✅ متاح | الأكثر استخداماً، تحويل بنكي |
| **Baridimob** | ✅ متاح | سريع، فوري |
| **Edahabia** | ✅ متاح | بطاقة ذهبية، تحويل فوري |
| **Bank Transfer** | ✅ متاح | تقليدي، بطيء |
| **Flexy (Algerie Poste)** | ✅ متاح | بطاقة مسبقة الدفع |

## تدفق الدفع

```
1. الزبون يختار الخدمة ← يفتح له صفحة الدفع
2. تظهر له معلومات الحساب البنكي (CCP أو Baridimob)
3. الزبون يحول المبلغ
4. يرفع صورة إثبات الدفع (سكرين شوت)
5. المدير يستلم إشعار ← يفحص الصورة ← يؤكد الدفع
6. الطلب ينتقل إلى "in_execution"
7. بعد التنفيذ ← الطلب "completed"
```

## Tax ID (رقم التعريف الجبائي)

للثقة، يظهر رقم CCP أو رقم الحساب الرسمي. يمكن استخدام حساب بريدي جاري (CCP) باسم المشروع.

## إدارة إثبات الدفع

```
┌─────────────────────────────────────────────┐
│  💳 تأكيد الدفع - الطلب #42                  │
│                                             │
│  المبلغ: 3,900 DZD                          │
│  الطريقة: Baridimob                         │
│                                             │
│  ┌─── إثبات الدفع ──────────────────────┐   │
│  │  [صورة التحويل]                       │   │
│  │  اسم المرسل: أحمد بن علي              │   │
│  │  التاريخ: 15/04/2026 15:22            │   │
│  │  المرجع: 123456789                    │   │
│  └──────────────────────────────────────┘   │
│                                             │
│  [✅ تأكيد الدفع] [❌ رفض - سبب: ______]     │
└─────────────────────────────────────────────┘
```

---

# 7. 📈 خطة MVP (7 أيام)

## اليوم 1-2: الأساسيات

- [ ] تهيئة المشروع (Vite + Express + TypeScript + Prisma + SQLite)
- [ ] نظام المصادقة (Register/Login + JWT + Roles)
- [ ] نموذج User في Prisma + API
- [ ] واجهة تسجيل الدخول (React + Tailwind)

## اليوم 3-4: المنتجات والطلبات

- [ ] نموذج Product + API CRUD
- [ ] نموذج Order + API (إنشاء طلب، عرض الطلبات)
- [ ] صفحة إنشاء طلب (الزبون يختار منتج، يكتب ملاحظة)
- [ ] ExecutionGuide في Prisma + API
- [ ] صفحة عرض الخدمات (الكatalogue)

## اليوم 5-6: نظام الدفع ولوحة التحكم

- [ ] نموذج Payment + PaymentProof + API
- [ ] رفع صور إثبات الدفع
- [ ] لوحة تحكم admin: عرض الطلبات + فلترة
- [ ] صفحة تنفيذ الطلب (Execution Guide + Smart Notes)
- [ ] أكشن: تأكيد الدفع، بدء التنفيذ، إكمال الطلب

## اليوم 7: اللمسات الأخيرة + الإطلاق

- [ ] ActivityLog + تتبع النشاطات
- [ ] التقارير الأساسية
- [ ] Deploy على Railway/Fly.io
- [ ] إضافة 3 منتجات حقيقية (ChatGPT, Netflix, Canva)
- [ ] أول زبون حقيقي (صديق أو من مجموعة فيسبوك)

## كيف أختبر السوق بسرعة؟

1. **انشر بوست** في مجموعات فيسبوك جزائرية للخدمات الرقمية
2. **اعرض 3 خدمات فقط** بأسعار أقل من المنافسين (حتى لو خسارة بسيطة)
3. **نفذ أول 10 طلبات يدوياً** بدون نظام (عشان تتعلم العملية)
4. **اسأل الزبائن**: وش أعجبهم؟ وش يريدون؟ كم سعر مناسب؟
5. **طور النظام** بناءً على feedback حقيقي

---

# 8. 🚀 خطة التوسع (Scaling Plan)

## المرحلة 1: Solo (1-3 أشهر)
- أنت المدير والمنفذ والمسوق
- النظام بسيط (SQLite)
- 10-20 زبون في الشهر
- ربح: 50,000 - 100,000 DZD/شهر

## المرحلة 2: Team (3-6 أشهر)
- توظف منفذ (Operator) براتب أو عمولة
- تضيف صلاحية "staff" في النظام
- تنتقل لـ PostgreSQL (لأن SQLite ما يتحمل multiple users)
- تضيف نظام Reseller
- ربح: 200,000+ DZD/شهر

**إضافة خاصية الموظفين:**
```prisma
// في الـ User model
model User {
  // ... الحقول الموجودة
  role String @default("customer") // "admin" | "staff" | "customer"
  
  // كل موظف له صلاحيات محددة
  assignedOrders Order[] @relation("AssignedStaff")
}
```

## المرحلة 3: API + Automation (6-12 شهر)
- تطور API للبائعين (Resellers)
- تبدا أتمتة بعض الخدمات (الخدمات السهلة زي VPN)
- تستخدم Playwright/Puppeteer للتنفيذ الآلي
- تضيف نظام اشتراكات (Subscription)

## كيف تحول النظام لـ SaaS؟

1. **Multi-tenant**: كل "بائع" عنده حساب في نظامك
2. **White-label**: كل بائع يقدر يغير الألوان والشعار
3. **API First**: كل حاجة في النظام تشتغل عن طريق API
4. **Commission model**: تاخد عمولة 10% من كل عملية بيع

## كيف تضيف API؟

```typescript
// مثال API للبائعين
POST /api/v1/orders
Body: {
  product_slug: "chatgpt-plus",
  customer_phone: "0555123456",
  customer_notes: "..."
}
Headers: {
  "X-API-Key": "sk_live_..."
}

Response: {
  order_id: "42",
  status: "pending",
  payment_info: {
    ccp: "00712345678",
    amount: 3900
  }
}
```

---

# 9. 🎨 UX/UI Design System

## مبادئ التصميم

1. **Mobile-first** (معظم الزبائن من الجوال)
2. **Fast** (أقل من 2 ثانية تحميل)
3. **Minimal** (لا تزحمة، فقط المهم)
4. **Arabic-first** (اتجاه RTL، لغة عربية)

## لوحة الألوان

```
الأساسي:    #1a1a2e (كحلي غامق)
الثانوي:    #16213e (أزرق داكن)
مميز:       #0f3460 (أزرق متوسط)
أكشن:       #e94560 (أحمر/وردي)
نجاح:       #2ecc71 (أخضر)
مال:        #f39c12 (ذهبي/برتقالي)
خلفية:      #f8f9fa (فاتح)
نص:         #2d3436 (داكن)
```

## المكونات الأساسية

### StatusBadge
```tsx
const statusConfig = {
  pending: { label: 'قيد الانتظار', color: 'bg-gray-100 text-gray-800' },
  awaiting_payment: { label: 'بانتظار الدفع', color: 'bg-yellow-100 text-yellow-800' },
  payment_review: { label: 'مراجعة الدفع', color: 'bg-blue-100 text-blue-800' },
  in_execution: { label: 'قيد التنفيذ', color: 'bg-purple-100 text-purple-800' },
  completed: { label: 'مكتمل', color: 'bg-green-100 text-green-800' },
  cancelled: { label: 'ملغي', color: 'bg-red-100 text-red-800' },
}
```

### OrderCard (للزبون)
```
┌─────────────────────────┐
│  ChatGPT Plus           │
│  الحالة: ✅ مكتمل       │
│  المبلغ: 3,900 DZD      │
│  ⏱️ 15/04/2026          │
│  [عرض التفاصيل]         │
└─────────────────────────┘
```

### واجهة الزبون vs واجهة المشرف

| الزبون | المشرف/المنفذ |
|--------|---------------|
| يرى فقط طلباته | يرى كل الطلبات |
| يرى الحالة فقط | يرى + يغير الحالة |
| يرفع إثبات الدفع | يؤكد الدفع |
| لا يرى التكلفة | يرى التكلفة والربح |
| لا يرى Execution Guide | يرى Execution Guide |
| لا يرى Smart Notes | يرى ويكتب Smart Notes |

## التوجيه (Routing)

```
/                     → صفحة الهبوط (الخدمات)
/login                → تسجيل الدخول
/register             → إنشاء حساب
/orders               → طلباتي (للزبون)
/orders/new           → طلب جديد
/orders/:id           → تفاصيل الطلب

/admin                → Dashboard
/admin/orders         → كل الطلبات
/admin/orders/:id     → صفحة تنفيذ الطلب
/admin/products       → إدارة المنتجات
/admin/customers      → العملاء
/admin/reports        → التقارير
```

---

# 10. ⚠️ المخاطر + الحلول

## مخاطر الحسابات

| المشكلة | الحل |
|---------|------|
| **إغلاق الحساب** | استخدم حسابات "نظيفة" (جديدة، بدون نشاط مشبوه) |
| **Ban للبطاقة** | استخدم بطاقات متعددة، لا تربط بطاقة واحدة بكل الحسابات |
| **طلب استعادة (Recovery)** | استخدم أرقام وهمية للتوثيق، أو أرقام SMSPool |
| **تحقق بالهاتف** | استخدم خدمات أرقام مؤقتة (5sim.net, sms-activate.org) |

## مخاطر الدفع

| المشكلة | الحل |
|---------|------|
| **الزبون يدعي ما دفع** | نظام إثبات الدفع الإجباري + أرشفة الصور |
| **التحويل يأتي ناقص** | قبل تأكيد الدفع، تحقق من المبلغ |
| **تجميد الحساب البنكي** | لا تحتفظ بمبالغ كبيرة في الحساب، وزع على حسابات متعددة |
| **الزبون يطلب استرداد** | سياسة استرداد واضحة: 24 ساعة بعد الشراء لا استرداد |

## مخاطر توقف الخدمات

| المشكلة | الحل |
|---------|------|
| **Netflix يلغي حساب** | عندك 3 مزودين مختلفين، دائماً خيار احتياطي |
| **ChatGPT يحظر منطقة** | استخدم VPN ثابت، بطاقة من نفس الدولة |
| **ارتفاع سعر الاشتراك** | هامش ربح 20-30% عشان تمتص الصدمات |
| **مزود يرفع السعر** | تعاقد مع 2-3 مزودين لكل خدمة |

## كيفية تقليل الاعتماد على الأطراف الخارجية

1. **بناء علاقات مباشرة**: بدل ما تشتري من وسيط، اشتري مباشرة من المصدر
2. **تخزين المخزون**: عندك حسابات جاهزة مسبقاً (Pre-created accounts)
3. **أنظمة بديلة**: كل خدمة عندك بديل (ChatGPT vs Claude, Netflix vs Shahid)
4. **احتياطي مالي**: احتفظ بـ 30% من الأرباح كصندوق طوارئ

---

# 📦 الخلاصة: خريطة الطريق

```
الأسبوع 1:  نظام MVP (7 أيام)
الأسبوع 2:  أول 10 زبائن حقيقيين
الشهر 1:    20+ زبون، تحسين النظام
الشهر 2-3:  PostgreSQL + Staff roles
الشهر 3-6:  Reseller system + API
الشهر 6-12: Automation + SaaS multi-tenant
```

## تكلفة البدء ($100)

| البند | التكلفة |
|-------|---------|
| Domain (.dz أو .com) | $10 |
| استضافة (Railway/Fly.io) | $5-15/شهر |
| SMTP Service (Resend) | $0 (300 إيميل/يوم مجاناً) |
| SMS Service | $10 |
| إعلانات فيسبوك (اختبار) | $30 |
| احتياطي | $35 |
| **المجموع** | **$100** |

## نصيحة أخيرة

> لا تضيع وقتك في الميزات الثانوية. اشتغل على **Execution Engine** أولاً.
> إذا قدر الزبون يطلب وأنت تقدر تنفذ بسرعة واحترافية، الربح بيجي لوحده.
> النظام أداة، الخدمة الجيدة هي اللي بتجيب الزبون.

---

**تم إعداد هذه الخطة بواسطة: AI CTO & Architect**
**لمشروع: Digital Services Operating System (DSOS)**

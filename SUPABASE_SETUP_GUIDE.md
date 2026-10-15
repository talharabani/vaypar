# 🚀 Supabase Setup & Integration Guide (اردو / English)

Ye guide aapko step-by-step batati hai ke **Supabase** par account banane se le kar Vaypar app ke sath connect karne tak **kya kya cheezein chahiye** aur **wo kahan se milengi**.

---

## 📌 Table of Contents
1. [Kiya Kiya Chahiye? (Summary Checklist)](#1-kiya-kiya-chahiye-summary-checklist)
2. [Step 1: Supabase Project Create Karna](#step-1-supabase-project-create-karna)
3. [Step 2: API Keys Kahan Se Milengi? (URL & Anon Key)](#step-2-api-keys-kahan-se-milengi-url--anon-key)
4. [Step 3: Database Tables & Schema Kahan Run Karna Hai?](#step-3-database-tables--schema-kahan-run-karna-hai)
5. [Step 4: Authentication Settings (Email Login)](#step-4-authentication-settings-email-login)
6. [Step 5: App Mein Kahan Paste Karna Hai?](#step-5-app-mein-kahan-paste-karna-hai)
7. [Step 6: Verify Karna (Testing Checklist)](#step-6-verify-karna-testing-checklist)

---

## 1. Kiya Kiya Chahiye? (Summary Checklist)

| No. | Required Item | Ye Kya Hai? | Kahan Se Milega? | Kahan Daalna Hai? |
|---|---|---|---|---|
| **1** | **Supabase Project URL** | Aapke cloud database ka unique web address | Supabase Dashboard > Project Settings > API | `.env` ya App Settings Modal |
| **2** | **anon / public Key** | Mobile app ke liye safe public API key | Supabase Dashboard > Project Settings > API | `.env` ya App Settings Modal |
| **3** | **Database Schema (SQL)** | Tables, RLS security policies, triggers | Hamari project file: `supabase/migrations/001_initial_schema.sql` | Supabase > SQL Editor |
| **4** | **Email Auth Setting** | Email/Password login allow karna | Supabase > Authentication > Providers > Email | Supabase Dashboard |

> [!CAUTION]
> **service_role (secret) key** ko kabhi bhi app ya `.env` mein **NAHI** daalna! Sirf **`anon` (public)** key use karni hai.

---

## Step 1: Supabase Project Create Karna

1. Browser mein **[supabase.com](https://supabase.com)** open karein.
2. **"Start your project"** ya **"Sign in"** par click karein (GitHub ya Google account se login kar sakte hain).
3. Dashboard par aakar **"New Project"** button par click karein.
4. Details enter karein:
   - **Name**: `vaypar-app` (ya jo bhi naam aap chahein)
   - **Database Password**: Ek strong password generate karein aur kahin note kar lein.
   - **Region**: Apne nazdeek tareen region select karein (e.g. *Singapore* ya *Frankfurt*).
5. **"Create new project"** par click karein. *(Project setup hone mein 1-2 minute lagenge)*.

---

## Step 2: API Keys Kahan Se Milengi? (URL & Anon Key)

Jab aapka project ready ho jaye:

1. Left sidebar mein sabse neeche **Settings (Gear Icon ⚙️)** par click karein.
2. Settings menu mein **"API"** (ya **"Data API"**) par click karein.
3. Wahan aapko 2 main cheezein milengi:

### A. Project URL
- Label hoga: **Project URL**
- Example format: `https://abcdefghijklm.supabase.co`
- Saamne **Copy** button hoga, wahan se copy kar lein.

### B. Project API Key (anon / public)
- Table mein **Project API keys** ka section hoga.
- Wahan row dekhein jiska name **`anon`** aur tag **`public`** hoga.
- Example format: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
- Saamne **Copy** button se is key ko copy kar lein.

---

## Step 3: Database Tables & Schema Kahan Run Karna Hai?

Aapki app ke tamam tables (`products`, `invoices`, `customers`, `expenses`, `installment_accounts`, `businesses`, `profiles`) aur multi-tenant security policies bananey ke liye:

1. Apne Supabase project dashboard ke left sidebar mein **SQL Editor** (`>_` icon) par click karein.
2. Upar **"+ New query"** button dabayein.
3. Apne computer par is file ko open karein:
   👉 **`d:\vaypar\supabase\migrations\001_initial_schema.sql`**
4. Is file ka **sara code copy (Ctrl + A -> Ctrl + C)** karein.
5. Supabase ke SQL Editor mein **paste** kar dein.
6. Neeche right side par **"Run"** (ya `Ctrl + Enter`) press karein.
7. Result mein **"Success. No rows returned"** ka green message aayega. 
   *(Ab aapke tamam tables aur Row-Level Security lock ready hain!)*

---

## Step 4: Authentication Settings (Email Login)

Users ko email aur password se login karwane ke liye:

1. Supabase ke left sidebar mein **Authentication** (People/User icon) par click karein.
2. Phir **"Providers"** tab par click karein.
3. List mein **"Email"** par click karein:
   - **Enable Email provider**: Checkmark `ON` hona chahiye.
   - **Confirm email**: Agar aap chahte hain ke user signup karte hi foran login ho jaye (verification email ka wait na karna pare), to **"Confirm email"** ko **OFF (Disable)** kar dein.
4. Neeche **"Save"** par click karein.

---

## Step 5: App Mein Kahan Paste Karna Hai?

Aap credentials ko 2 aasan tareeqon se app mein dal sakte hain:

### Tareeqa 1: Direct App ke Settings Tab Se (Sab Se Aasan ⚡)
1. Vaypar app open karein (Mobile par ya Web par `http://localhost:8081`).
2. Bottom bar se **Settings** par jayein.
3. Upar **"Supabase Cloud & Data Isolation"** card nazar aayega.
4. **"Configure Supabase"** button par tap karein.
5. Modal khulega:
   - **Supabase URL**: Apna copied URL paste karein.
   - **Anon Public Key**: Apni copied `anon` key paste karein.
6. **"Save & Connect"** dabayein.
   - App foran cloud se connect ho jayegi aur status **🟢 CLOUD SYNC ACTIVE** ho jayega!

---

### Tareeqa 2: `.env` File ke Zariye (Developer Method 🛠️)
1. Project folder mein `d:\vaypar\.env` file open karein.
2. Ye do lines edit karein:
   ```env
   EXPO_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```
3. Save karein (`Ctrl + S`).
4. Terminal par `npm start` se server reload karein.

---

## Step 6: Verify Karna (Testing Checklist)

Testing ke liye ye simple 3 steps follow karein:

1. **Test User A (e.g. `shopkeeper1@gmail.com`)**:
   - Sign up karein.
   - 2 products add karein (e.g. "Sugar", "Milk") aur 1 bill create karein.
   - Settings mein **"Sync Now"** dabayein.
   - Supabase dashboard > **Table Editor** > `products` table mein jayein — aapko aapke products nazar aayenge jinme user ka `business_id` attach hoga.

2. **Logout karein**:
   - Settings mein ja kar **Logout** karein.

3. **Test User B (e.g. `shopkeeper2@gmail.com`)**:
   - Naye email se sign up karein.
   - Aap dekhenge ke User B ki screen bilkul empty hai (User A ka koi product ya bill show nahi hoga).
   - User B apna naya product add karega (e.g. "Medicine") jo sirf uske account ke andar save hoga.

---

## ❓ Frequently Asked Questions (FAQ)

**Q: Kya internet band hone par app band ho jayegi?**
> **Nahi!** App offline-first hai. Internet na hone par local SQLite database mein transactions hoti rahengi. Jaise hi internet aayega, Settings mein ja kar ya auto-sync ke zariye data cloud par sync ho jayega.

**Q: Kya kisi or dukandar ko meri sales ya profit nazar aa sakta hai?**
> **Hargiz nahi!** Database engine mein Row Level Security (RLS) active hai. Supabase server kisi bhi aise query ko reject kar deta hai jo doosre business ka data maange.

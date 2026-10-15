# Vyapar Multi-Biz: Mobile Business Management Platform

Vyapar Multi-Biz is a scalable, offline-first mobile and web application built using **React Native with Expo**, **SQLite**, and **Firebase**. It is designed for merchants and shop owners who need to manage their products, inventory, invoices, and expenses across multiple independent business profiles with secure data isolation.

---

## 🏗️ Architecture & Core Design

### 1. Local-First / Sync-Second
The application is designed to be **resilient to network fluctuations**. All user actions (creating invoices, updating stock, logging expenses) are executed instantly in a local relational **SQLite** database.
- **Relational Integrity:** Utilizes SQL transactions. Creating an invoice automatically deducts stock; canceling an invoice rolls back and restores stock.
- **Soft Deletion:** Deletions set a `deleted = 1` flag, queuing the change for synchronization.

### 2. Synchronization Engine
A background sync worker monitors network connection state (via `@react-native-community/netinfo`):
- **Upload Sync:** Identifies locally modified records where `synced = 0` and pushes updates to Firebase Firestore.
- **Download Sync:** Pulls remote modifications that occurred since the local sync checkpoint using Timestamp markers.
- **Data Isolation:** All database collections in Firestore are organized in subcollections scoped by the user's Auth UID (`users/{userId}/...`), keeping each business completely isolated.

### 3. Graceful Hybrid Fallback (Demo Sandbox)
If the app is launched without a network connection or without production Firebase credentials configured, it automatically enables **Offline Demo Mode**. A demo sandbox profile is created in SQLite, unlocking 100% of the app's features (cataloging, invoicing, receipt previews, expenses) without requiring a sign-in.

---

## 🛠️ Tech Stack
- **Frontend Framework:** React Native with Expo SDK 57 (Expo Router)
- **Local Storage:** `expo-sqlite`
- **Network Listener:** `@react-native-community/netinfo`
- **Sharing & Printing:** `expo-print` & `expo-sharing`
- **Cloud Backend:** Firebase Auth, Firestore
- **State Management:** React Context API
- **Vector Icons:** `@expo/vector-icons` (Ionicons)

---

## 📂 Directory Structure

```
├── src/
│   ├── app/                      # Expo Router navigation tabs and screen routes
│   │   ├── index.tsx             # Dashboard: Sales, Expenses, Profit metrics, Low Stock alerts
│   │   ├── products.tsx          # Inventory Catalog: search, chip filters, quick restock adjusters
│   │   ├── bills.tsx             # Invoices & billing: billing form, customer details, past invoices
│   │   ├── expenses.tsx          # Expenses: logger by category, category distribution bars
│   │   ├── settings.tsx          # Business settings: invoice details form, backup status, manual sync
│   │   └── _layout.tsx           # Navigation controller wrapping contexts and splash overlays
│   ├── components/               # Custom UI assets & widgets
│   │   ├── Button.tsx            # Theme-coded large interactive buttons
│   │   ├── Card.tsx              # Shadowed container wrapper
│   │   ├── Input.tsx             # Floating-border field with inline password visibility toggle
│   │   ├── AuthScreen.tsx        # Sign-in / registration landing forms & Demo mode CTA
│   │   ├── ReceiptModal.tsx      # ESC/POS monospace paper preview, share, and simulated print popup
│   │   └── app-tabs.tsx          # Bottom tab layouts with vectors (Ionicons)
│   ├── context/                  # React state providers
│   │   ├── AuthContext.tsx       # Auth sessions management (Firebase Auth & local sandbox)
│   │   └── DatabaseContext.tsx   # SQLite wrapper, transactional updates, netinfo sync workers
│   ├── services/                 # Interfaces for external APIs
│   │   ├── firebase.ts           # Firebase SDK initialization with AsyncStorage persistence
│   │   ├── sqlite.ts             # Local database table creation and CRUD operations
│   │   ├── sync.ts               # Local-to-cloud reconciler
│   │   ├── pdfGenerator.ts       # HTML invoice rendering and sharing (WhatsApp integration)
│   │   └── thermalPrinter.ts     # ESC/POS 58mm printer formatters and BLE simulator
│   ├── theme/
│   │   └── colors.ts             # Mint/Teal primary and Slate background mapping definitions
│   └── global.d.ts               # Global stylesheets module definitions
├── assets/                       # App static image assets
├── tsconfig.json                 # TypeScript compiler setup
├── app.json                      # Expo plugins and platform configurations
└── package.json                  # Dependencies configuration
```

---

## 🚀 Installation & Running Guide

### 1. Clone & Install Dependencies
Navigate to the root project directory and install npm packages:
```bash
npm install
```

### 2. Configure Firebase Web Credentials
Create a `.env` file in the root directory (or inject them directly in your environment):
```env
EXPO_PUBLIC_FIREBASE_API_KEY="your-firebase-api-key"
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN="your-project-id.firebaseapp.com"
EXPO_PUBLIC_FIREBASE_PROJECT_ID="your-project-id"
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET="your-project-id.appspot.com"
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="your-sender-id"
EXPO_PUBLIC_FIREBASE_APP_ID="your-app-id"
```
*Note: If these env variables are omitted, the app gracefully runs in Local Offline-First mode automatically.*

### 3. Firebase Security Rules
Deploy the following Security Rules to your Firebase console to ensure users can **only** read and write their own business data:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Scopes rules for all documents under 'users/{userId}' subcollection path
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

### 4. Running the Dev Server
Start the Expo Metro bundler:
```bash
npx expo start
```
Use the terminal prompt keys to run:
- **`w`** to open in a web browser.
- **`a`** to load on an Android emulator.
- **`i`** to load on an iOS simulator.
- Scan the QR code using the **Expo Go** application on your physical device.

---

## 🖨️ Thermal Printing & PDF Sharing

### 1. Invoice PDF Compilation
When you generate an invoice, the app compiles the data into a responsive HTML sheet styled in Indian Rupees (₹). `expo-print` generates a PDF file from this HTML, and `expo-sharing` initiates a native action sheet allowing you to share the invoice directly to **WhatsApp, Email, or Files**.

### 2. ESC/POS 58mm Receipt Printer compatibility
The app includes a dedicated formatter mapping values to a **32-character** layout compatible with standard **58mm Bluetooth receipt printers**:
- Centered double-height bold store headers.
- Tabular item columns (`Item (12 char) | Qty (4 char) | Rate (7 char) | Total (9 char)`).
- Dotted dividers.
- Bold grand totals.
- Native paper-cutting codes.

A monospace print preview screen is provided, complete with simulated Bluetooth printer connections (transmitting raw byte buffers) so you can test physical layouts.

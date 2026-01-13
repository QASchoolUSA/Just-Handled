# **App Name**: Trucking Financial Bridge

## Core Features:

- Driver Profile Management: Manage driver information, including pay type (percentage or CPM), pay rate, and recurring deductions like insurance and escrow.
- Settlement Wizard: Input load details (Load #, Driver, Gross Linehaul, Fuel Surcharge, Factoring Fee) and upload/input credit card charges, categorizing each as either a company expense or driver deduction.
- Automated Calculation Engine: Automatically calculate driver gross pay, net pay (accounting for deductions), and total factoring deductions.
- QBO CSV Export: Generate QBO-ready CSV files for both Invoices (Revenue) and Journal Entries (Settlements), formatted with the required QBO headers (InvoiceNo, Customer, Amount, Class, JournalNo, Debit, Credit, Name) and data mapping.
- Accrued Pay Validation: Use a tool that uses rules to validates that the Accrued Driver Pay liability account nets to $0 after settlements, blocking export if there are discrepancies.
- Health Check Dashboard: Display a dashboard providing key financial insights, including Accrued Pay Balance, Average Margin per Load, and Total Factoring Fees.

## Style Guidelines:

- Primary color: Deep sky blue (#329DFF), inspired by the trustworthiness and forward movement commonly associated with the fintech sector.
- Background color: Light gray (#F0F4F8), offering a clean and professional backdrop that ensures readability and minimizes distraction.
- Accent color: Cyan (#48D6FF), providing a vibrant contrast for interactive elements and key indicators, enhancing user engagement.
- Body and headline font: 'Inter' (sans-serif) for a clean, modern, and readable UI.  It provides clarity and objectivity suited to a financial application.
- Use Lucide-react icons for a consistent and clean visual language.
- Employ a grid-based layout with consistent spacing and padding to ensure a balanced and intuitive user experience.
- Use subtle animations for transitions and feedback to enhance the user experience without being distracting.
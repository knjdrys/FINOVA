# Extractable Components

## Header
- Source: `src/components/navigation/Header.tsx`
- Category: layout
- Description: Top bar with user profile, guest indicator / logout, global currency picker, and account filter
- Extractable props: selectedAccountId (string, default: "ALL"), isGuest (boolean, default: true)
- Hardcoded: FINOVA brand typography, greeting format, icons, currency options

## BottomNavigation
- Source: `src/components/navigation/BottomNavigation.tsx`
- Category: layout
- Description: Floating bottom bar with 4 navigation tabs and a prominent lime (+) action button
- Extractable props: currentTab (string, default: "HOME")
- Hardcoded: Tab icons, labels, floating styling, blur effects

## WaveCard
- Source: `src/components/ui/WaveCard.tsx`
- Category: basic
- Description: Signature emerald sinusoidal wave animation card displaying Safe-To-Spend™ today
- Extractable props: safeToSpendToday (number), status (string)
- Hardcoded: Canvas wave simulation math, lime sparkle icon, FINOVA gradient styling

## FilterChips
- Source: `src/components/ui/FilterChips.tsx`
- Category: basic
- Description: Horizontally scrollable chip selector with active pill styling and chevron navigation
- Extractable props: selectedId (string), items (array)
- Hardcoded: Smooth scroll physics, chevron icons, scrollbar hiding

## Modal
- Source: `src/components/ui/Modal.tsx`
- Category: layout
- Description: Backdrop blur bottom sheet / dialog with responsive mobile-to-desktop transitions
- Extractable props: isOpen (boolean), title (string)
- Hardcoded: Backdrop blur, close button, transition animation

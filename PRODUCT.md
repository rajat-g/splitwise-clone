# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Groups of friends, roommates, and trip-mates splitting shared expenses (dinners, travel, flats, events). No accounts: one person creates a group and the rest join via link or code. Used on both phones and desktops in roughly equal measure — mobile at the table, desktop for review/settle-up.

## Product Purpose

Track who paid for what, show who owes whom, and settle up with the fewest payments. Updates are realtime so everyone in the group sees the same numbers. Success: a group can go from "create" to "settled" without signing up, installing anything, or paying.

## Positioning

The no-login Splitwise: private-by-link groups (unguessable link + rotatable invite code, no public directory), realtime balances for everyone, free hosting and backend. A neighboring product with mandatory accounts could not truthfully copy the flow.

## Operating Context

Core loop: create group → share link/code → members join by name → add expenses (equal, exact, %, shares) → watch live balances → record settle-up payments → export CSV. Groups are casual and short-lived (a trip) or long-lived (a flat).

## Capabilities and Constraints

Confirmed functionality: groups with per-group currency; members by name (add/rename/remove, removal blocked on non-zero balance); expenses with four split modes, edit/delete (settlements immutable); live balances + simplified debts; settle-up payments; activity feed; CSV export; rotatable invite codes; recent-groups on device.
Technical: React + Vite + Tailwind frontend, Convex realtime backend, Vercel hosting. Must ship light and dark themes. Must be fully usable on phone, tablet, and desktop. No login system — identity is display-name only.

## Brand Commitments

Standing user preference: the familiar clean-fintech canon (Splitwise-grade), executed at full fidelity without irony or smuggled quirk. No binding name, colors, or assets beyond that commitment.

## Evidence on Hand

No testimonials, customers, benchmarks, or brand assets. Must not fabricate any.

## Product Principles

1. Zero friction to first expense: name → group → spend, no signup.
2. One shared truth: every member sees the same live numbers.
3. Privacy by construction: nothing enumerable, sharing is explicit.
4. Mobile at the table, desktop for the books: both first-class.
5. Free forever: no paywalls, no tiers, no dark patterns.

---
name: "Departamental"
description: "The existing visual system for commerce and role-based operations."
colors:
  page: "oklch(0.982 0.003 264)"
  surface: "oklch(0.998 0.001 264)"
  surface-muted: "oklch(0.955 0.009 264)"
  ink: "oklch(0.225 0.03 264)"
  muted: "oklch(0.46 0.02 264)"
  line: "oklch(0.89 0.009 264)"
  accent: "oklch(0.48 0.19 266)"
  accent-strong: "oklch(0.4 0.17 266)"
  accent-soft: "oklch(0.91 0.05 266)"
  on-accent: "white"
  focus: "oklch(0.57 0.19 266)"
  success: "oklch(0.45 0.16 260)"
  success-surface: "oklch(0.93 0.045 260)"
  warning: "oklch(0.49 0.11 76)"
  warning-surface: "oklch(0.94 0.05 82)"
  danger: "oklch(0.48 0.16 25)"
  danger-surface: "oklch(0.94 0.035 25)"
  dark-page: "oklch(0.18 0.018 264)"
  dark-surface: "oklch(0.225 0.022 264)"
  dark-surface-muted: "oklch(0.285 0.028 264)"
  dark-ink: "oklch(0.965 0.009 264)"
  dark-muted: "oklch(0.76 0.024 264)"
  dark-line: "oklch(0.36 0.028 264)"
  dark-accent: "oklch(0.76 0.16 266)"
  dark-accent-strong: "oklch(0.84 0.13 266)"
  dark-accent-soft: "oklch(0.34 0.065 266)"
  dark-on-accent: "oklch(0.18 0.018 264)"
  dark-focus: "oklch(0.84 0.15 266)"
  dark-success: "oklch(0.79 0.13 260)"
  dark-success-surface: "oklch(0.31 0.065 260)"
  dark-warning: "oklch(0.83 0.12 82)"
  dark-warning-surface: "oklch(0.32 0.06 82)"
  dark-danger: "oklch(0.82 0.13 25)"
  dark-danger-surface: "oklch(0.32 0.065 25)"
typography:
  display:
    fontFamily: "Geist, Arial, Helvetica, sans-serif"
    fontSize: "48px"
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Geist, Arial, Helvetica, sans-serif"
    fontSize: "30px"
    fontWeight: 600
    lineHeight: "36px"
    letterSpacing: "-0.035em"
  title:
    fontFamily: "Geist, Arial, Helvetica, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: "28px"
  section-title:
    fontFamily: "Geist, Arial, Helvetica, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: "28px"
  body:
    fontFamily: "Geist, Arial, Helvetica, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "24px"
  label:
    fontFamily: "Geist, Arial, Helvetica, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: "20px"
  support:
    fontFamily: "Geist, Arial, Helvetica, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "20px"
  mono:
    fontFamily: "Geist Mono, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "16px"
rounded:
  lg: "8px"
  xl: "12px"
  2xl: "16px"
  full: "calc(infinity * 1px)"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "8": "32px"
  "9": "36px"
  "10": "40px"
  "12": "48px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.label}"
    rounded: "{rounded.xl}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.accent-strong}"
    textColor: "{colors.on-accent}"
  button-primary-dark:
    backgroundColor: "{colors.dark-accent}"
    textColor: "{colors.dark-on-accent}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.xl}"
    padding: "8px 16px"
  button-secondary-hover:
    backgroundColor: "{colors.surface-muted}"
  button-ghost:
    textColor: "{colors.accent-strong}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "0px 12px"
  button-ghost-hover:
    backgroundColor: "{colors.accent-soft}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "0px 12px"
    height: "44px"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.2xl}"
    padding: "20px"
  navigation-item:
    textColor: "{colors.muted}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "8px 12px"
  navigation-item-active:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.accent-strong}"
  tag-pending:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-strong}"
    rounded: "{rounded.full}"
    padding: "4px 10px"
  tag-warning:
    backgroundColor: "{colors.warning-surface}"
    textColor: "{colors.warning}"
    rounded: "{rounded.full}"
    padding: "4px 10px"
  tag-success:
    backgroundColor: "{colors.success-surface}"
    textColor: "{colors.success}"
    rounded: "{rounded.full}"
    padding: "4px 10px"
  message-success:
    backgroundColor: "{colors.success-surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.xl}"
    padding: "16px"
  message-error:
    backgroundColor: "{colors.danger-surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.xl}"
    padding: "16px"
---

# Design System: Departamental

## Overview

**Creative North Star: "Moderna, profesional y clara"**

The incumbent interface uses a restrained blue accent, cool neutral surfaces and Geist to keep commerce and operational work legible. The confirmed product personality is modern, professional and clear: hierarchy supports the information and actions appropriate to each role.

Density comes from grouped fields, readable rows, explicit labels and modest separation between tasks. Shared navigation and controls provide continuity across public account forms and authenticated workspaces. Account work extends this system; it does not establish a separate identity.

**Key Characteristics:**

- One blue action accent with a paired foreground in each color scheme.
- Cool page, surface and muted-surface layers, separated mainly by restrained borders.
- Geist for interface text; Geist Mono for identifiers and structured technical data.
- Rounded controls, larger panel corners and visible keyboard focus.
- Responsive reflow and small state transitions that respect reduced motion.

This record was extracted from the implemented styles and components. The frontmatter is normative; the source variables in `src/app/globals.css` remain the implementation source. The sidecar adds component samples, motion, elevation and breakpoint metadata. Dormant chart variables are not promoted into the reusable system.

## Colors

The palette uses a single blue accent over cool neutrals, with named operational states and matching light and dark surface pairings. The `dark-` entries record the overrides selected by `prefers-color-scheme: dark`; implementation components use the unsuffixed CSS custom property names in both modes.

### Primary

- **Action Blue** (`accent`): primary actions, selected accents and small interface icons.
- **Strong Action Blue** (`accent-strong`): primary hover, action links and active navigation text.
- **Soft Action Blue** (`accent-soft`): selected or highlighted backgrounds and pending-status tags.
- **On Accent** (`on-accent`): text on a filled action button; the foreground changes with the color scheme.
- **Focus Blue** (`focus`): the shared keyboard outline.

**The Accent Pairing Rule.** A filled primary action uses `accent` or `accent-strong` with `on-accent`. Keep the pair intact when the color scheme changes.

### Neutral

- **Page** (`page`): the application canvas.
- **Surface** (`surface`): header, inputs, panels and dialogs.
- **Muted Surface** (`surface-muted`): secondary regions, navigation backing and loading or empty-state containers.
- **Ink** (`ink`): primary text and the inverted account companion panel.
- **Muted Ink** (`muted`): supporting descriptions, metadata and placeholders on neutral surfaces.
- **Line** (`line`): subtle borders, dividers and row separators.

### Operational States

- **Success Blue** (`success`, `success-surface`): completed or confirmed states. The incumbent success hue remains blue; do not substitute a green palette.
- **Warning Amber** (`warning`, `warning-surface`): attention, in-progress work and degraded availability.
- **Danger Red** (`danger`, `danger-surface`): field errors and failed requests.

State labels and messages carry the meaning alongside color. The account feedback container uses the state surface with ordinary ink, while field errors use the danger foreground.

## Typography

**Display Font:** Geist, with Arial, Helvetica and sans-serif fallbacks.  
**Body Font:** Geist, with the same fallback stack.  
**Label/Mono Font:** Geist for labels; Geist Mono for identifiers.

**Character:** A single sans-serif family keeps headings, forms and operational data cohesive. Weight and size establish the hierarchy; close tracking is reserved for larger headings and the existing wordmark.

### Hierarchy

- **Display:** the large companion-panel heading in desktop account layouts. It is a local use of the `display` token, not a required heading on every screen.
- **Headline:** the main account-form and employee-workspace title.
- **Title:** list sections, dialog headings and account-panel headings.
- **Section Title:** compact panel headings, including the invitation form.
- **Body:** explanatory and feedback copy; regular interface text also uses the label-sized line height when it is a short value or row.
- **Label:** field names, buttons and primary navigation.
- **Support:** hints and secondary metadata. Short metadata can use the tighter inherited line height.
- **Mono:** UUIDs, SKUs and comparable identifiers; use the actual data role to justify the family.

The account text field uses a larger mobile input size (16px), then returns to the compact size (14px) from the small breakpoint. Some incumbent account page headings expand at the small breakpoint (36px with 40px line height). These are responsive uses, not a second display voice.

**The Purposeful Type Rule.** Use Geist for the interface and Geist Mono for data that benefits from fixed-width characters. Let headings carry their hierarchy without introducing a decorative pre-heading label.

## Layout

Authenticated pages share a centered frame with a maximum width (90rem). Horizontal padding grows from the compact inset (16px) to the small-screen inset (24px) and then the desktop inset (32px). Page block padding grows from the compact separation (36px) to the desktop separation (48px).

The recurring spacing rhythm is based on four-pixel steps. Labels sit close to their fields; field groups use the compact task gap (20px), and new sections commonly begin at the larger separation (32px or 36px). Panel padding is compact on mobile (20px) and commonly increases at the small breakpoint (24px); some account panels use a roomier inset (28px).

Account layouts use one column below the large breakpoint. At the large breakpoint (64rem), the existing composition adds an inverted companion panel and a form column with proportions (1.1fr / 0.9fr), with the form-side track bounded below (26rem). The form section is centered and bounded (28rem). This is the account pattern rather than a universal page template.

The shell keeps the wordmark and account actions together on mobile while search occupies the next row. Desktop search joins them in the same row. Desktop primary navigation becomes a disclosure menu below the large breakpoint, with links reflowing to two columns from the small breakpoint (40rem).

Forms and operational rows reflow instead of shrinking their contents. The employee invitation fields become two columns from the small breakpoint; employee rows become identity, status and action columns from the large breakpoint. Actions wrap, names break at word boundaries and email addresses can break to preserve the viewport.

## Elevation & Depth

The main page is flat. Page, surface and muted-surface tones, plus thin lines, separate the header, panels and rows. The account companion region uses ink against surface text to establish a large tonal contrast. Ordinary account forms and employee panels do not use decorative shadows.

The existing account menu and sign-out dialog provide a soft, downward overlay-shadow vocabulary. These shadow values are recorded as overlay evidence, not permission to combine a wide shadow and a bordered card. Employee confirmation uses the surface tone and a dimmed modal backdrop.

### Shadow Vocabulary

- **Overlay menu:** the existing low overlay shadow; its exact value is in the sidecar.
- **Overlay dialog:** the existing larger modal shadow; its exact value is in the sidecar.

**The Surface Separation Rule.** Main content panels use tonal separation and a restrained line. Reserve overlay elevation for content that actually sits above the page.

## Shapes

The recurring shape language uses gently rounded controls (`xl`), larger panel and dialog corners (`2xl`), and smaller navigation or ghost-action corners (`lg`). Full rounding belongs to compact status tags and small counters, rather than large containers.

Neutral control and panel boundaries use a thin stroke (1px) from `line`. Employee lists use horizontal dividers and open rows; they do not turn every person into a separate card.

## Components

### Buttons

Compact, explicit actions with a consistent rounded shape.

- **Primary:** action-blue fill, paired on-accent foreground and the `button-primary` padding. Account actions have a minimum height (44px).
- **Secondary:** neutral surface, ink text and a thin line border; hover moves to muted surface.
- **Ghost:** a text action with smaller corners; hover adds the soft accent surface.
- **Hover / Focus:** color transitions use the existing default duration (150ms) and easing. Keyboard focus uses the shared outline (2px) with an offset (3px).
- **Disabled / Loading:** account buttons use reduced opacity (0.55), a disabled cursor and an explicit processing label. Other incumbent shell controls use a nearby disabled opacity (0.60); this is an observed local variation.

### Chips

Small, readable state labels.

- **Style:** full rounding, compact padding, small text (12px) and semibold weight.
- **State:** pending uses soft action blue; attention uses warning amber; completed work uses success blue. Labels explain the status, so hue alone is never the status definition.
- **Behavior:** these status tags are informational rather than controls.

### Cards / Containers

Quiet containers around a real task or related account information.

- **Corner Style:** the panel radius from `rounded.2xl`.
- **Background:** surface for a primary task and muted surface for a secondary region.
- **Border / Depth:** a thin line border on primary task panels; follow the surface separation rule.
- **Internal Padding:** the panel token records the mobile inset; the invitation panel increases to the small-screen inset in its responsive sample.

### Inputs / Fields

Visible labels and predictable text entry.

- **Style:** surface fill, line border, control corners and a fixed height (44px). Standard fields use horizontal padding (12px); the login's drawn leading icons reserve a larger inset (40px).
- **Labels / Hints:** semibold labels precede the field; hints sit below in support text with muted ink.
- **Focus:** the shared visible outline. The header search separately uses its authored focus-within border and soft ring; that local treatment does not replace the shared field rule.
- **Error / Disabled:** errors appear below the related field in danger text and are associated through accessibility attributes. The account field does not invent a red border state. Disabled fieldsets block interaction while the action label communicates progress.

### Navigation

A muted horizontal navigation backing with compact links.

- **Default:** muted text, small corners and semibold labels.
- **Hover:** a surface background with ink text.
- **Active:** a surface background with strong action-blue text and a current-page attribute.
- **Mobile:** a native disclosure summary with a visible active destination; the links reflow beneath it. Drawn library icons accompany the menu and account controls.

### Feedback Messages

A rounded state surface with normal ink and body copy. Success identifies the next step; errors sit beside the task and provide recovery. Account feedback uses status or alert semantics rather than animation to announce a result.

### Operational Rows

Identity, operational status and available actions form a readable row separated by a line. Short status headings use muted support text, values use medium weight, and actions wrap when space is limited. This is the employee-list pattern, consistent with the incumbent preference for task information over decorative containers.

### Interaction Motion

The implemented motion is small: color changes and disclosure-chevron rotation. Color and transform transitions use the standard easing; the account-menu chevron uses a short explicit duration (200ms). Reduced-motion preferences shorten animation and transition duration (0.01ms), limit animation repetition and restore automatic scrolling. Do not turn these state changes into section entrances.

## Do's and Don'ts

### Do:

- **Do** use the existing OKLCH variables and their corresponding dark overrides.
- **Do** pair filled primary actions with `on-accent` in both color schemes.
- **Do** preserve Geist, the shared rounded controls and visible keyboard focus.
- **Do** group related fields and keep operational rows readable as they reflow.
- **Do** name states and actions explicitly alongside their color treatment.
- **Do** respect reduced motion and keep transitions tied to interaction state.

### Don't:

- **Don't** introduce a new accent family or substitute green for the incumbent success blue.
- **Don't** apply overlay shadows to ordinary task panels.
- **Don't** make decorative kickers or eyebrows part of the heading hierarchy.
- **Don't** use monospace for ordinary interface copy.
- **Don't** shrink the account controls or hide a field's label to fit a narrow viewport.
- **Don't** turn the account companion layout into the template for every authenticated page.

Existing drift is not a reusable rule: the incumbent login and some older pages carry pre-heading labels; several older accent controls still hard-code white instead of the mode-aware foreground; older account overlays combine border and broad shadow; selection, caret and scrollbar styling remain browser defaults. This documentation does not repair or canonize those inherited details.


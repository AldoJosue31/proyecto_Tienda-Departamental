# Login: blanco exterior, gris central y eslogan

Scope: user-requested refinement on 2026-10-13. Change the photo's perimeter and the companion panel to pure white, retaining only diffused central gray and contact shadows near the products. Replace the operational headline with “Todo lo que te gusta, en un solo lugar.” Remove the credentials-introduction paragraph and the employee-invitation paragraph beside the inputs. Preserve the form, registration link and authentication behavior.

Asset: `public/catalog/login-products-v3.png`.

Provenance: edited with the built-in Imagegen tool using the previous login photograph as the reference. Previous versions are available in Git history. This is an AI-generated decorative interpretation of the existing catalog products.

Source: `C:/Users/Aldo/.codex/generated_images/01a132f3-f44d-7200-a31d-eed79369a050/exec-1e95d4dc-b102-4730-8a8c-19f46d066ceb.png`.

Implementation: a pure-white photographic panel and a statically imported original PNG with intrinsic aspect ratio. The photograph itself transitions smoothly from central light gray to white outer background. A perimeter alpha fade further blends its actual image bounds into the white panel. No blur is applied to products or text.

Verification: desktop 1680×882 and mobile 390×844 inspected in the browser. The panel computes to RGB(255,255,255), the photo keeps its intrinsic aspect ratio and the two requested paragraphs are absent. No horizontal overflow. ESLint, TypeScript and the Impeccable detector passed. Desktop screenshot: `.impeccable/review/login-white-slogan-desktop.jpg`.

## Edit prompt

Use case: precise-object-edit
Edit target: the attached portrait department-store product photograph.
Primary request: change ONLY the empty studio background and floor so the entire photograph has PURE WHITE #FFFFFF outer edges and a soft, diffused light-gray area only near the center and around the products. This is a correction of a gray perimeter, not a new product arrangement.
Background: the top blank region and all empty background along the left, right and bottom boundaries must be flat RGB(255,255,255), #FFFFFF. Absolutely no off-white, gray border, gray rim or dark vignetting at any image boundary. Near the product group, preserve a very subtle neutral light-gray haze and realistic soft contact shadows. Blend the central gray gently and smoothly outwards into pure white in all directions, with no hard transition or rectangular area.
Preserve exactly: the same five products, their positions, scale, perspective, colors, material details and sharp contours: walnut chair with rust-orange upholstery, cream table lamp, white/blue running shoe, black over-ear headphones and black fitness watch. Keep the original portrait 4:5 composition and the generous white upper area for a separate HTML headline. Do not soften or fade the products, crop them, distort them, add anything or change their styling.
Quality: retain the existing high-detail photo rendering. All product surfaces must stay crisp; only the central background gradient and contact shadows should be diffused.
Constraints: no text, no logo, no watermark, no frame, no border, no people, no UI. Output the final photograph on an opaque pure-white background.

# Login: fotografía de productos

Scope: narrow refinement of `src/app/login/page.tsx`, approved by the user on 2026-10-12. Preserve the login form and account links. Remove “Bienvenido”, “Acceso de plataforma” and the two requested explanatory paragraphs. Keep “La misma operación, con permisos claros.” above the photograph.

Verification: image loaded in the browser, complete product composition visible at 1680×882 and 1024×768; mobile form verified at 390×844 with no horizontal overflow. Computed styles confirm `object-fit: contain`, the original 4:5 aspect ratio and dark ink on both the wordmark and headline in dark mode. ESLint and TypeScript passed. The Impeccable font-size advisory was resolved by using the documented 30–48px type endpoints.

Implementation: image fitting, the photographic panel's light colors and the headline's responsive size are explicit element styles so these essential properties do not depend on generated utility rules. A small top inset keeps the products clear of the heading.

Visual direction: minimalist product still life on white with a subtle light-gray gradient. Keep the whole arrangement visible, with no photographic text or badges. Preserve the existing desktop companion panel and mobile single-column form.

Asset: `public/catalog/login-products-v1.png`.

Provenance: AI-generated using the built-in Imagegen tool. The subjects correspond to the existing catalog: Silla Atelier, Lámpara Lumen de mesa, Audífonos Nova ANC, Tenis Kinetic Run and Reloj Vertex Fit. This image is a decorative interpretation, not a replacement for individual catalog product photographs.

Source: `C:/Users/Aldo/.codex/generated_images/01a132f3-f44d-7200-a31d-eed79369a050/exec-d8626a25-4e16-4e76-b7b2-ffd2f70325e7.png`.

## Generation prompt

Use case: product-mockup
Asset type: photograph for the left visual panel of the Departamental login page.
Primary request: a minimalist photorealistic studio photograph of several department-store products thoughtfully arranged together on a white seamless floor, against a white background with a very subtle light-gray gradient.
Subject: a compact walnut wood armchair with muted rust-orange fabric at rear left, an elegant cream dome table lamp with a brass stem at rear right, matte black over-ear headphones in front near center, one white athletic running shoe with restrained blue detailing at front left, and a black fitness smartwatch at front right. All five products visible as a single coherent realistic still life, with natural relative scale and enough separation to identify each item.
Composition/framing: portrait 4:5 composition; products grouped in the lower half to lower two thirds; generous clean empty white space in the top third for the heading which will be added in HTML. Straight-on studio view with a slightly elevated camera angle, centered balanced arrangement. Objects entirely inside frame; no split panels, no collage, no image grid.
Lighting/mood: soft diffused daylight-like studio lighting, gentle realistic contact shadows, premium but simple department-store catalog photography.
Materials/textures: realistic walnut, woven upholstery, matte plastic, mesh knit, cream ceramic and satin brass.
Constraints: white and subtly gray background must remain bright and minimal. No lettering, no text, no logos, no watermarks, no people, no UI or borders. Generate only the photograph, without embedding the heading.

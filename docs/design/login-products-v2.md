# Login: nitidez y fondo continuo

Scope: user-requested refinement on 2026-10-13. Improve the photo's detail and blend its background into the companion panel. Preserve all five products, the existing headline and the login behavior.

Asset: `public/catalog/login-products-v2.png`.

Provenance: edited with the built-in Imagegen tool, using `public/catalog/login-products-v1.png` as the reference. Preserve the original as a prior version. This is an AI-generated decorative interpretation of existing catalog products.

Source: `C:/Users/Aldo/.codex/generated_images/01a132f3-f44d-7200-a31d-eed79369a050/exec-c618a0e3-02ed-42ac-9af7-912fa9e7d3c1.png`.

Implementation: statically imported image with intrinsic dimensions and both maximum dimensions constrained, preserving its aspect ratio. Orthogonal alpha fades are applied to the actual image's perimeter, blending into the fixed `#f5f5f5` panel. Gradient colors are alpha-mask stops, never painted colors. No blur is applied to products or text. This photograph serves its original PNG without additional lossy compression; other images keep their existing optimization.

Verification: desktop 1680×882, intermediate 1024×768 and mobile 390×844, with no horizontal overflow. The browser loads the original 1122×1402 PNG, maintains its intrinsic aspect ratio and applies the intersected edge masks without a blur filter. ESLint and TypeScript passed. The detector's opaque mask-color advisory was resolved using white alpha stops, which do not paint the image.

## Edit prompt

Use case: precise-object-edit
Edit target: the attached minimalist department-store product still life used in a login panel.
Primary request: improve this exact photograph's resolution and fine detail, and make its background blend smoothly into a #f5f5f5 panel. Produce a high-resolution portrait image, ideally 2048 by 2560 pixels or larger, retaining the original 4:5 aspect ratio.
Preserve: the same five products, their shapes, proportions, positions, relative scale and colors: walnut chair with rust upholstery behind left, cream table lamp behind right, white and blue running shoe in front left, black headphones front center, and black fitness watch front right. Preserve the generous blank upper area for the existing HTML heading. Keep the same lighting direction and realistic contact shadows. Do not redesign the objects, add products or crop any product.
Quality: crisp photorealistic woven fabric and knit texture, wood grain, precise headphone edges, clean lamp materials, natural detail without artificial oversharpening or halos.
Background adjustment: a nearly white seamless studio floor and backdrop with a very subtle neutral-gray gradient only near the center and soft contact shadows. The entire top, bottom, left and right image boundaries must smoothly approach a uniform neutral RGB(245,245,245), hex #f5f5f5, with no detectable rectangular boundary. Keep objects inside a small safe margin so their edges are not faded. No hard bands, no border, no image frame.
Constraints: keep the subjects sharp; soften only the empty background perimeter. No text, lettering, logos, watermark, people or UI.

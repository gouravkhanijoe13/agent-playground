# Website Review: gouravkhanijoe.com

**Reviewed:** 2026-03-16
**URL:** https://gouravkhanijoe.com
**Stack:** Vanilla HTML/CSS/JS, GSAP (CDN), Canvas API

---

## Summary

The site has a strong visual identity — dark background, amber accents, bold typography (Bebas Neue + Cormorant Garamond), and a live starfield canvas. The overall aesthetic communicates a senior engineer's personal brand effectively. However, several functional, SEO, and accessibility issues need to be addressed before this can be considered production-ready.

---

## Issues Found

### Critical

#### 1. Contact Form Does Not Submit
The contact form shows a success UI state but has no backend integration. There is no `action` attribute, no `fetch`/`XHR` call, and no server endpoint. Messages are silently dropped.

**Fix:** Wire up the form to an email service (e.g., Resend, Formspree, EmailJS) or a serverless function.

#### 2. Missing SEO Meta Tags
No `<title>`, `<meta name="description">`, or Open Graph tags (`og:title`, `og:description`, `og:image`) are present. This means the site is invisible to search engines and renders poorly when shared on social media.

**Fix:** Add at minimum:
```html
<title>Gourav Khanijoe — Staff Software Engineer</title>
<meta name="description" content="13+ years building distributed systems. Staff Engineer at HubSpot.">
<meta property="og:title" content="Gourav Khanijoe">
<meta property="og:description" content="Staff Software Engineer. Dad. Engineer. Creator.">
<meta property="og:image" content="https://gouravkhanijoe.com/og-image.png">
<meta property="og:url" content="https://gouravkhanijoe.com">
```

#### 3. Project Links Are Placeholder (`href="#"`)
The "View project →" links in the work section all point to `#`. Clicking them causes a jarring scroll-to-top with no navigation.

**Fix:** Add real URLs or remove the links until they're ready.

---

### High Priority

#### 4. Missing `alt` Text on Images
The hero photo and life section card images have no `alt` attributes. This breaks screen readers and fails WCAG 2.1 AA compliance.

**Fix:** Add descriptive `alt` text to all `<img>` elements.

#### 5. Social Links Missing Security Attributes
External links (LinkedIn, GitHub, Twitter/X, Instagram) open in new tabs but lack `rel="noopener noreferrer"`, which exposes the page to reverse tabnapping attacks.

**Fix:**
```html
<a href="https://linkedin.com/in/..." target="_blank" rel="noopener noreferrer">LinkedIn</a>
```

#### 6. Missing `<html lang>` Attribute
The `<html>` element has no `lang` attribute, which breaks screen reader language detection.

**Fix:** `<html lang="en">`

#### 7. Hero Photo Is Missing
The hero section has a `.hero-photo` container but no actual image is loaded. The section appears visually incomplete.

**Fix:** Add a real headshot image.

---

### Medium Priority

#### 8. No Canonical URL Tag
Without a canonical tag, if the site is accessible at both `http://` and `https://` or with/without `www`, search engines may index duplicate content.

**Fix:** `<link rel="canonical" href="https://gouravkhanijoe.com">`

#### 9. Continuous Canvas Animation Without Optimization
The starfield canvas runs a `requestAnimationFrame` loop unconditionally. On low-power devices or when the tab is backgrounded, this wastes CPU/battery.

**Fix:** Pause the loop when the tab is not visible using the Page Visibility API:
```js
document.addEventListener('visibilitychange', () => {
  if (document.hidden) cancelAnimationFrame(rafId);
  else animate();
});
```

#### 10. Form Inputs Lack Linked `<label>` Elements
Form `<input>` and `<textarea>` elements are not programmatically associated with their labels via `for`/`id` pairing. This is an accessibility failure.

**Fix:**
```html
<label for="name">Name</label>
<input id="name" name="name" type="text">
```

#### 11. Canvas Has No Accessibility Fallback
The `#starfield` canvas element has no fallback content or `aria-hidden="true"`. Since it is purely decorative, it should be hidden from assistive technology.

**Fix:** `<canvas id="starfield" aria-hidden="true"></canvas>`

---

### Low Priority

#### 12. No Structured Data
Adding Schema.org `Person` markup would improve how the site appears in Google search results (knowledge panels, rich snippets).

#### 13. GSAP Loaded From CDN
GSAP is loaded from an external CDN, which creates a runtime dependency on that CDN's availability. If GSAP fails to load, the scroll animations silently fail.

**Fix:** Bundle GSAP via npm or add a local fallback.

#### 14. Navigation Dot Indicators Lack Labels
The right-side section dot indicators have no accessible labels, making them unusable for keyboard or screen reader navigation.

**Fix:** Add `aria-label` attributes describing the target section.

---

## What's Working Well

- Strong, distinctive visual identity with consistent amber/dark theme
- Clear content hierarchy: Build → Live → Share → Contact
- Smooth scroll and section snapping feel polished
- Mobile responsive layout at 768px breakpoint
- Staggered GSAP fade-in animations on scroll add depth
- Good use of semantic section structure

---

## Recommended Priority Order

1. Fix contact form (messages are being lost)
2. Add SEO meta tags (site is invisible to search engines)
3. Add hero photo (visually incomplete)
4. Fix project links (`href="#"` is broken UX)
5. Add `alt` text and `lang` attribute (accessibility/compliance)
6. Add `rel="noopener noreferrer"` to external links (security)
7. Address canvas performance (battery/CPU drain)

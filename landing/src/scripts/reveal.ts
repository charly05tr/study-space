// Fades elements up as they enter the viewport. Stagger with data-reveal-delay="ms".
const elements = document.querySelectorAll<HTMLElement>('[data-reveal]');

const observer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    }
  },
  { rootMargin: '0px 0px -10% 0px', threshold: 0.1 },
);

for (const element of elements) {
  const delay = element.dataset.revealDelay;
  if (delay) element.style.setProperty('--reveal-delay', `${delay}ms`);
  observer.observe(element);
}

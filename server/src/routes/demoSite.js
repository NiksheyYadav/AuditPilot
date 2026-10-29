import { Router } from 'express';

// Small multi-page demo site for the whole-site crawl (/demo/site). Deliberate flaws, so the site audit has something to find:
// duplicate titles (about/team), duplicate descriptions (beans/gear), a broken link (/demo/site/missing),
// a page robots.txt tells crawlers to skip (/demo/site/private/*) and an off-site link.
const page = ({ title, desc, h1, body }) => Buffer.from(
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">` +
  `<title>${title}</title>${desc ? `<meta name="description" content="${desc}">` : ''}<link rel="canonical" href="/demo/site"></head>` +
  `<body><main><h1>${h1}</h1>${body}</main></body></html>`);

const SHARED_DESC = 'Freshly roasted coffee beans and brewing gear from Acme Coffee Roasters, shipped every Tuesday to your door.';

const pages = {
  '': page({ title: 'Acme Coffee Roasters Demo Shop - Home Page', desc: 'Welcome to the Acme Coffee Roasters demo shop: browse beans, gear and our story, then get in touch with the team.', h1: 'Acme Coffee Shop',
    body: '<nav><a href="/demo/site/about">About us</a> <a href="/demo/site/products">Products</a> <a href="/demo/site/contact">Contact</a> <a href="/demo/site/missing">Old offers</a> <a href="/demo/site/private/secret">Staff area</a> <a href="https://example.com/">Partner site</a></nav>' }),
  about: page({ title: 'About Acme Coffee Roasters - Our Story and Team', desc: 'Read how Acme Coffee Roasters started in a garage and grew into a small team that roasts every Monday morning.', h1: 'About us',
    body: '<p>Our story.</p><a href="/demo/site/team">Meet the team</a> <a href="/demo/site">Home</a>' }),
  team: page({ title: 'About Acme Coffee Roasters - Our Story and Team', desc: 'Meet the roasters, packers and baristas behind every bag of Acme coffee, with a short note about what each of us loves.', h1: 'Our team',
    body: '<p>Meet the people.</p><a href="/demo/site/about">About</a>' }),
  products: page({ title: 'Acme Coffee Products - Beans, Gear and Gift Sets', h1: 'Products',
    body: '<a href="/demo/site/products/beans">Beans</a> <a href="/demo/site/products/gear">Gear</a> <a href="/demo/site">Home</a>' }),
  'products/beans': page({ title: 'Single Origin Coffee Beans - Acme Coffee Roasters', desc: SHARED_DESC, h1: 'Beans', body: '<p>Single origin beans.</p><a href="/demo/site/products">All products</a>' }),
  'products/gear': page({ title: 'Brewing Gear and Grinders - Acme Coffee Roasters', desc: SHARED_DESC, h1: 'Gear', body: '<p>Grinders and kettles.</p><a href="/demo/site/products">All products</a>' }),
  contact: page({ title: 'Contact Acme Coffee Roasters - Visit or Write to Us', desc: 'Find our roastery address, opening hours and the form to write to Acme Coffee Roasters with any question about orders.', h1: 'Contact',
    body: '<form><input type="text" name="name"><input type="email" name="email"><button type="submit">Send</button></form><a href="/demo/site">Home</a>' }),
  'private/secret': page({ title: 'Staff Only Area - Acme Coffee Roasters Internal', desc: 'Internal staff page that robots.txt asks crawlers to stay away from, so the audit must never fetch it.', h1: 'Staff', body: '<p>Secret.</p>' }),
};

export const demoSiteRouter = Router();
demoSiteRouter.get(/^\/demo\/site(?:\/(.*))?$/, (req, res) => {
  const key = (req.params[0] || '').replace(/\/$/, '');
  const html = pages[key];
  if (!html) return res.status(404).type('html').send('<!doctype html><title>Not found</title><h1>Not found</h1>');
  res.type('html').send(html);
});

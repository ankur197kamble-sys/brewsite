export type MenuItem = {
  name: string;
  description: string;
  price: string;
};

export type Cafe = {
  name: string;
  foundedYear: number;
  /** Short line above the headline, e.g. what the café is known for. */
  highlights: string;
  tagline: string;
  whatsapp: string;
  mapsUrl: string;
  phone: string;
  instagram: string;
  story: string;
  storySecondary: string;
  heroImage: string;
  galleryImages: string[];
  address: string[];
  hours: string[];
  menuItems: MenuItem[];
};

export const cafe: Cafe = {
  name: "Brewsite Café",

  foundedYear: 2018,
  highlights: "Specialty coffee",
  whatsapp: "917219282659",
  phone: "917219282659",
  instagram: "https://instagram.com/",

  tagline: "Slow mornings. Good coffee.",

  story: "Coffee tastes better when you slow down.",

  storySecondary:
    "We believe a café should feel like a pause button. Good beans, thoughtful food, warm light and enough time to finish the conversation.",

  heroImage:
    "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=2200&q=85",

  galleryImages: [
    "https://images.unsplash.com/photo-1445116572660-236099ec97a0?auto=format&fit=crop&w=1200&q=85",
    "https://images.unsplash.com/photo-1498804103079-a6351b050096?auto=format&fit=crop&w=1200&q=85",
    "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=1200&q=85",
  ],

  address: ["24 Market Street", "Your City, India"],
  
  mapsUrl: "https://maps.google.com/?q=24+Market+Street",
  
  hours: [
    "Mon — Fri · 8am — 7pm",
    "Sat — Sun · 9am — 8pm",
  ],

  menuItems: [
    {
      name: "Velvet Cappuccino",
      description: "Double espresso, silky milk, cocoa dust",
      price: "₹220",
    },
    {
      name: "Burnt Caramel Latte",
      description: "Espresso, caramel, steamed milk, sea salt",
      price: "₹240",
    },
    {
      name: "Midnight Mocha",
      description: "Dark chocolate, espresso, cold cream",
      price: "₹260",
    },
  ],
};
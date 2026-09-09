import { pgTable, serial, text, integer } from "drizzle-orm/pg-core";

export const cafes = pgTable("cafes", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  foundedYear: integer("founded_year"),
  tagline: text("tagline"),
  story: text("story"),
  storySecondary: text("story_secondary"),
  whatsapp: text("whatsapp"),
  phone: text("phone"),
  instagram: text("instagram"),
  mapsUrl: text("maps_url"),
  address: text("address"),
});
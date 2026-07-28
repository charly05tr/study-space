/** Tag.name is a CharField(max_length=50) on the serializer's child field. */
export const MAX_TAG_LENGTH = 50;

export interface ParsedTags {
  tags: string[];
  error?: string;
}

/**
 * Turns "algebra, proofs , algebra" into ["algebra", "proofs"].
 * Dedupe is exact-match because the backend does Tag.objects.get_or_create(name=...),
 * so "Algebra" and "algebra" are genuinely two different tags.
 */
export const parseTags = (raw: string): ParsedTags => {
  const tags = [
    ...new Set(
      raw
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ];

  const tooLong = tags.find((tag) => tag.length > MAX_TAG_LENGTH);
  if (tooLong) {
    return { tags, error: `"${tooLong}" is longer than ${MAX_TAG_LENGTH} characters.` };
  }

  return { tags };
};

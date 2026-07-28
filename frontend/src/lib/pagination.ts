/**
 * DRF PageNumberPagination envelope (REST_FRAMEWORK.PAGE_SIZE = 10).
 * List endpoints never return a bare array — always this wrapper.
 */
export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

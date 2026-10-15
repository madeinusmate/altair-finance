export const register = async (): Promise<void> => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { loadBooksOwner } = await import("@/lib/load-books-owner");
  await loadBooksOwner();
};

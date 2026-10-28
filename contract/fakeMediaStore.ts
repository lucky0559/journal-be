// Stand-in for the app's `@/data/mediaStore` (a native module): "downloads" a file by naming where it would land on the phone.
export const downloadMedia = async (_url: string, id: string, ext: string): Promise<string> => `file:///device/media/${id}.${ext}`;

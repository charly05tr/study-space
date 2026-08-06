import axios from '../../../config/axios';
import type { CreateNotePayload, NoteDetail, NoteUpdatePayload } from '../types';

const BASE_URL = '/notes';

export const notesApi = {
  get: async (noteId: number): Promise<NoteDetail> => {
    const response = await axios.get(`${BASE_URL}/${noteId}/`);
    return response.data;
  },

  /**
   * Plain JSON, unlike sources: a note has no file to upload, so there is no
   * reason to pay for a multipart body.
   */
  create: async (payload: CreateNotePayload): Promise<NoteDetail> => {
    const response = await axios.post(`${BASE_URL}/`, payload);
    return response.data;
  },

  /**
   * PATCH, never PUT: NoteUpdateSerializer also owns `title` and the image
   * fields, and an autosave that only knows about the body must not blank them
   * out by omission.
   */
  update: async (noteId: number, payload: NoteUpdatePayload): Promise<NoteDetail> => {
    const response = await axios.patch(`${BASE_URL}/${noteId}/`, payload);
    return response.data;
  },

  /**
   * Takes the note's blocks with it, and with them every relation drawn from or
   * to one of them — the map loses that whole region. Both cascade in the
   * model, so there is nothing left half-deleted behind.
   */
  remove: async (noteId: number): Promise<void> => {
    await axios.delete(`${BASE_URL}/${noteId}/`);
  },
};

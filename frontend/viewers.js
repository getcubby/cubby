
import MainModel from './models/MainModel.js';

const OPEN_WITH_VIEWERS = [
  { id: 'office', label: 'Open with Office' },
  { id: 'text', label: 'Open with editor' }
];

function getOpenWithViewers(entry) {
  if (!entry || entry.isDirectory) return [];

  const viewers = [];

  if (entry.mimeType === 'application/pdf' && MainModel.canHandleWithOffice(entry)) viewers.push(OPEN_WITH_VIEWERS[0]);
  if (!entry.isBinary && entry.fileName.endsWith('md')) viewers.push(OPEN_WITH_VIEWERS[1]);

  return viewers;
}

export { OPEN_WITH_VIEWERS, getOpenWithViewers };

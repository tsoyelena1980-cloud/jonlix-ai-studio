import { handleLead } from './handler.ts';

export default function vercelLead(req: Parameters<typeof handleLead>[0], res: Parameters<typeof handleLead>[1]): Promise<void> {
  return handleLead(req, res);
}

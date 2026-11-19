export default function handler(_req: any, res: any) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(200).json({
    users: [],
    projects: [],
    folders: [],
    documents: [],
    tasks: [],
    notices: [],
    snippets: [],
    messages: [],
    activities: [],
    invitations: [],
  });
}

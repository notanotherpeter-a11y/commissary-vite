import { useParams } from 'react-router-dom'
export function BranchPage() {
  const { slug } = useParams()
  return <div className="p-6"><h1 className="text-2xl font-bold text-slate-800">Branch: {slug}</h1><p className="text-slate-500 mt-2">Migrating…</p></div>
}

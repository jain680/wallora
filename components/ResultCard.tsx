interface ResultCardProps {
  title: string
  content: string
  icon?: string
}

export default function ResultCard({ title, content, icon }: ResultCardProps) {
  return (
    <div className="card">
      <div className="flex items-start gap-4">
        {icon && <div className="text-3xl">{icon}</div>}
        <div className="flex-1">
          <h3 className="text-xl font-semibold text-warm-800 mb-3">{title}</h3>
          <div className="text-warm-600 whitespace-pre-line leading-relaxed">
            {content}
          </div>
        </div>
      </div>
    </div>
  )
}

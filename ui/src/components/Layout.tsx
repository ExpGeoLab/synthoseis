import { Link, useLocation } from 'react-router-dom'
import { LayoutDashboard, Play, Settings, Waves, Activity, GitBranch, Layers, Database } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/runs', label: 'Runs', icon: Play },
  { href: '/configs', label: 'Configs', icon: Settings },
  { href: '/faults', label: 'Faults', icon: GitBranch },
  { href: '/rockphysics', label: 'Rock Physics', icon: Waves },
  { href: '/wavelets', label: 'Wavelets', icon: Activity },
  { href: '/augmentation', label: 'Augmentation', icon: Layers },
  { href: '/datasets', label: 'Datasets', icon: Database },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation()

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-white">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-8">
              <h1 className="text-xl font-bold text-primary">SynToSeis</h1>
              <nav className="flex gap-1">
                {navItems.map((item) => {
                  const Icon = item.icon
                  const isActive = location.pathname === item.href || 
                    (item.href !== '/' && location.pathname.startsWith(item.href))
                  return (
                    <Link
                      key={item.href}
                      to={item.href}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <Icon className="w-4 h-4" />
                      {item.label}
                    </Link>
                  )
                })}
              </nav>
            </div>
          </div>
        </div>
      </header>
      <main className="container mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  )
}

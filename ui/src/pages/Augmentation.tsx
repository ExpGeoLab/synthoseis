import { Info, BookOpen, Layers, Move3d, StretchHorizontal, ArrowLeftRight } from 'lucide-react'

const augmentationMethods = [
  {
    id: 'tz_stretch',
    name: 'Time-Depth Stretch',
    description: 'Applies stretch/squeeze along the time/depth axis to simulate time-depth conversion effects.',
    icon: StretchHorizontal,
    details: [
      'Uses triangular distribution to determine squeeze depth and percentage',
      'Interpolates traces using spline-based stretching',
      'Applies same transformation to seismic data and hydrocarbon labels',
      'Seafloor location varies spatially across the volume'
    ],
    parameters: [
      { name: 'max_squeeze_depth', desc: 'Triangular distributed depth for maximum squeeze point' },
      { name: 'max_squeeze_pct', desc: 'Maximum stretch/squeeze percentage (1.05-1.25x)' },
      { name: 'seafloor_variation', desc: 'Spatially varying seafloor using uniform filter' }
    ]
  },
  {
    id: 'uniform_stretch',
    name: 'Uniform Stretch',
    description: 'Applies uniform stretch/squeeze in X, Y, and Z dimensions independently.',
    icon: Move3d,
    details: [
      'Random squeeze factors for each dimension (0.85-1.15x)',
      'Handles boundary conditions by rolling arrays when expanded',
      'Uses interpolation to resample stretched dimensions',
      'Preserves integer labels by rounding after interpolation'
    ],
    parameters: [
      { name: 'x_squeeze_factor', desc: 'X dimension stretch factor (0.85-1.15)' },
      { name: 'y_squeeze_factor', desc: 'Y dimension stretch factor (0.85-1.15)' },
      { name: 't_squeeze_factor', desc: 'Time dimension stretch factor (0.85-1.15)' }
    ]
  }
]

const useCases = [
  {
    title: 'Training Data Augmentation',
    description: 'Generate variations of synthetic seismic data to improve model robustness and prevent overfitting.',
    icon: Layers
  },
  {
    title: 'Time-Depth Variations',
    description: 'Simulate different velocity models and time-depth conversion scenarios.',
    icon: ArrowLeftRight
  },
  {
    title: 'Geometric Distortions',
    description: 'Create realistic geometric variations that might occur in real seismic acquisition.',
    icon: Move3d
  }
]

export default function Augmentation() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Data Augmentation</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Geometric transformations for training data variation
          </p>
        </div>
      </div>

      {/* Overview */}
      <div className="bg-blue-50 rounded-lg p-6">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="font-semibold text-blue-900 mb-2">About Augmentation</h3>
            <p className="text-sm text-blue-800">
              SynToSeis includes geometric augmentation methods that apply stretch and squeeze transformations 
              to synthetic seismic volumes. These augmentations help create diverse training datasets for 
              deep learning models by simulating variations in acquisition geometry, velocity models, and 
              processing workflows.
            </p>
          </div>
        </div>
      </div>

      {/* Augmentation Methods */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {augmentationMethods.map((method) => {
          const Icon = method.icon
          return (
            <div key={method.id} className="bg-white rounded-lg border p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-semibold text-lg">{method.name}</h3>
              </div>
              
              <p className="text-sm text-muted-foreground mb-4">
                {method.description}
              </p>

              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium mb-2">How It Works</h4>
                  <ul className="space-y-1">
                    {method.details.map((detail, idx) => (
                      <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                        <span className="text-primary mt-1">•</span>
                        {detail}
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h4 className="text-sm font-medium mb-2">Key Parameters</h4>
                  <div className="space-y-2">
                    {method.parameters.map((param, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-sm">
                        <code className="px-2 py-0.5 bg-gray-100 rounded text-xs font-mono">
                          {param.name}
                        </code>
                        <span className="text-muted-foreground">{param.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Use Cases */}
      <div className="bg-white rounded-lg border p-6">
        <div className="flex items-center gap-2 mb-4">
          <BookOpen className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">Common Use Cases</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {useCases.map((useCase, idx) => {
            const Icon = useCase.icon
            return (
              <div key={idx} className="p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Icon className="w-4 h-4 text-primary" />
                  <h4 className="font-medium text-sm">{useCase.title}</h4>
                </div>
                <p className="text-sm text-muted-foreground">
                  {useCase.description}
                </p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Implementation Note */}
      <div className="bg-amber-50 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <BookOpen className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="font-medium text-amber-900 mb-1">Implementation Note</h4>
            <p className="text-sm text-amber-800">
              Augmentation is applied during seismic volume generation in <code className="bg-amber-100 px-1 rounded">Seismic.py</code>. 
              The transformations modify both the seismic data (4D array with angle stacks) and hydrocarbon labels (3D array) 
              to maintain consistency. For more details, refer to <code className="bg-amber-100 px-1 rounded">datagenerator/Augmentation.py</code>.
            </p>
          </div>
        </div>
      </div>

      {/* API Usage */}
      <div className="bg-gray-900 rounded-lg p-6">
        <h3 className="font-semibold text-white mb-4">Python API Usage</h3>
        <pre className="text-sm text-green-400 overflow-x-auto">
          <code>{`from datagenerator.Augmentation import tz_stretch, uniform_stretch
import numpy as np

# Apply time-depth stretch
seismic_4d = np.random.randn(3, 100, 100, 500)  # (angles, x, y, z)
labels_3d = np.random.randint(0, 4, (100, 100, 500))
water_bottom = np.full((100, 100), 50)  # Seafloor depth in samples

stretched_seismic, stretched_labels = tz_stretch(
    seismic_4d, labels_3d, water_bottom
)

# Apply uniform stretch
uniform_seismic, uniform_labels = uniform_stretch(
    seismic_4d, labels_3d
)`}</code>
        </pre>
      </div>
    </div>
  )
}

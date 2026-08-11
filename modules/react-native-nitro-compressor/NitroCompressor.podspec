require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name         = 'NitroCompressor'
  s.version      = package['version']
  s.summary      = package['description']
  s.homepage     = 'https://github.com/margelo/react-native-nitro-modules'
  s.license      = package['license']
  s.authors      = 'Codex'
  s.platforms    = { :ios => min_ios_version_supported }
  s.source       = { :git => 'https://github.com/margelo/react-native-nitro-modules.git', :tag => s.version.to_s }
  s.source_files = [
    'ios/**/*.{h,m,mm,swift}',
    'cpp/**/*.{hpp,cpp}',
  ]

  load 'nitrogen/generated/ios/NitroCompressor+autolinking.rb'
  add_nitrogen_files(s)
  install_modules_dependencies(s)

  s.frameworks = 'AVFoundation', 'CoreImage', 'ImageIO', 'UniformTypeIdentifiers'
end

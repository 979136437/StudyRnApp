require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name         = 'NitroRefresh'
  s.version      = package['version']
  s.summary      = package['description']
  s.homepage     = 'https://github.com/CloudlessMoon/react-native-refresh'
  s.license      = package['license']
  s.authors      = 'Codex'
  s.platforms    = { :ios => min_ios_version_supported }
  s.source       = { :git => 'https://github.com/CloudlessMoon/react-native-refresh.git', :tag => s.version.to_s }
  s.source_files = [
    'ios/**/*.{h,m,mm,swift}',
    'cpp/**/*.{hpp,cpp}',
  ]

  load 'nitrogen/generated/ios/NitroRefresh+autolinking.rb'
  add_nitrogen_files(s)

  s.dependency 'React-Core'
  s.dependency 'React-RCTFabric'
  s.dependency 'React-jsi'
  s.dependency 'React-callinvoker'
  install_modules_dependencies(s)
end

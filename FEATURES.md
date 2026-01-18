# RadiAnt DICOM Viewer Clone - Features

Bu proje, RadiAnt DICOM Viewer'ın tüm özelliklerini içeren bir web tabanlı klonudur.

## ✅ Tamamlanan Özellikler

### Temel Özellikler
- ✅ DICOM dosya okuma ve parsing (dicom-parser)
- ✅ Çoklu DICOM format desteği (CR, DX, MG, CT, MR, PET-CT, US, XA, NM, SC, SR)
- ✅ Modern React + TypeScript + Vite yapısı
- ✅ Zustand ile state management

### Görüntüleme
- ✅ Cornerstone.js ile DICOM görüntüleme
- ✅ Zoom, pan, rotate işlemleri
- ✅ Brightness/Contrast (Window/Level) ayarları
- ✅ Preset window ayarları (Lung, Bone, Brain, Abdomen, Mediastinum)
- ✅ Horizontal/Vertical flip
- ✅ Görüntü navigasyonu (önceki/sonraki)

### Ölçüm Araçları
- ✅ Length (uzunluk) ölçümü
- ✅ Angle (açı) ölçümü
- ✅ Rectangle ROI
- ✅ Ellipse ROI
- ✅ Cornerstone Tools entegrasyonu

### Kullanıcı Arayüzü
- ✅ Sidebar ile study/series yönetimi
- ✅ Toolbar ile araç erişimi
- ✅ Status bar ile bilgi gösterimi
- ✅ Modern, koyu tema tasarımı
- ✅ Responsive layout

### Gelişmiş Özellikler
- ✅ Multi-viewer desteği (birden fazla görüntüleyici)
- ✅ PACS client dialog (yapılandırma ve arama)
- ✅ Export dialog (JPEG, BMP, PNG)
- ✅ Local archive servisi (IndexedDB)
- ✅ MPR viewer yapısı (Multi-planar reconstruction)
- ✅ 3D viewer yapısı (Three.js entegrasyonu)

## 🚧 Geliştirilmesi Gerekenler

### PACS Entegrasyonu
- [ ] Tam DICOM network implementasyonu (dcmjs/dcmnet kullanarak)
- [ ] C-FIND SCU implementasyonu
- [ ] C-MOVE SCU implementasyonu
- [ ] C-STORE SCU implementasyonu
- [ ] C-ECHO SCU implementasyonu

### 3D ve MPR
- [ ] Gerçek MPR rekonstrüksiyonu
- [ ] 3D volume rendering implementasyonu
- [ ] Cross-reference lines
- [ ] Synchronized navigation

### Export
- [ ] Canvas capture ve format dönüşümü
- [ ] WMV video export
- [ ] Batch export
- [ ] PDF export

### Diğer Özellikler
- [ ] PET-CT fusion
- [ ] Digital Subtraction Angiography (DSA)
- [ ] Time-intensity curves (TIC)
- [ ] Anonymization
- [ ] Printing support
- [ ] Multi-touch gesture desteği
- [ ] Hanging protocols
- [ ] Customizable UI themes

## 📦 Kullanılan Teknolojiler

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool
- **Cornerstone.js** - DICOM rendering
- **Cornerstone Tools** - Measurement tools
- **dicom-parser** - DICOM file parsing
- **Three.js** - 3D rendering
- **Zustand** - State management
- **Lucide React** - Icons

## 🚀 Kurulum ve Çalıştırma

```bash
# Bağımlılıkları yükle
npm install

# Geliştirme sunucusunu başlat
npm run dev

# Production build
npm run build
```

## 📝 Notlar

- Cornerstone.js web worker'ları için CDN kullanılıyor
- PACS özellikleri şu anda placeholder durumda (tam implementasyon için ek kütüphaneler gerekli)
- 3D rendering temel yapı hazır, gerçek volume data işleme eklenmeli
- Export özellikleri canvas capture ile tamamlanmalı

## 🔗 Referanslar

- [RadiAnt DICOM Viewer](https://www.radiantviewer.com/)
- [Cornerstone.js Documentation](https://www.cornerstonejs.org/)
- [DICOM Standard](https://www.dicomstandard.org/)

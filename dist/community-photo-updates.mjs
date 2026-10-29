// Retail packaging references only; never infer tester packaging, size or inventory.
export const communityPhotoUpdates = {
  "chanel-bleu-edt-bottle": {
    "image": "assets/community-box-chanel-bleu-edt.webp"
  },
  "chanel-bleu-edp-bottle": {
    "image": "assets/community-box-chanel-bleu-edp.webp"
  },
  "chanel-bleu-parfum-bottle": {
    "image": "assets/community-box-chanel-bleu-parfum.webp"
  },
  "chanel-allure-homme-sport-eau-extreme-bottle": {
    "image": "assets/community-box-chanel-allure-homme-sport-eau-extreme.webp"
  },
  "chanel-allure-homme-edition-blanche-bottle": {
    "image": "assets/community-box-chanel-allure-homme-edition-blanche.webp"
  },
  "chanel-chance-edp-bottle": {
    "image": "assets/community-box-chanel-chance-edp.webp"
  },
  "chanel-chance-eau-tendre-edp-bottle": {
    "image": "assets/community-box-chanel-chance-eau-tendre-edp.webp"
  },
  "chanel-chance-eau-fraiche-bottle": {
    "image": "assets/community-box-chanel-chance-eau-fraiche.webp",
    "referenceNote": "Eau Fraîche EDT packaging is pictured; confirm whether the seller’s offer is EDT or EDP."
  },
  "chanel-coco-edp-bottle": {
    "image": "assets/community-box-chanel-coco-edp.webp"
  },
  "chanel-coco-mademoiselle-edp-bottle": {
    "image": "assets/community-box-chanel-coco-mademoiselle-edp.webp"
  },
  "chanel-coco-mademoiselle-intense-bottle": {
    "image": "assets/community-box-chanel-coco-mademoiselle-intense.webp"
  },
  "chanel-coco-noir-bottle": {
    "image": "assets/community-box-chanel-coco-noir.webp"
  },
  "chanel-no5-edp-bottle": {
    "image": "assets/community-box-chanel-no5-edp.webp"
  },
  "chanel-platinum-egoiste-bottle": {
    "image": "assets/community-box-chanel-platinum-egoiste.webp"
  },
  "chanel-chance-eau-splendide-bottle": {
    "image": "assets/community-box-chanel-chance-eau-splendide.webp"
  },
  "paris-corner-rifaaqat-bottle": {
    "image": "assets/community-box-paris-corner-rifaaqat.webp"
  },
  "mykonos-sorrento-bottle": {
    "image": "assets/community-box-mykonos-sorrento.webp"
  },
  "mykonos-imperium-bottle": {
    "image": "assets/community-box-mykonos-imperium.webp"
  }
};
export function applyCommunityPhotoUpdates(products){return products.map(p=>{const update=communityPhotoUpdates[p.id];return update&&p.image==='assets/community-photo-pending.webp'?{...p,image:update.image,photoPending:false}:p;});}
export function communityPhotoCaption(p){const update=communityPhotoUpdates[p.id];return update&&p.image===update.image?'Retail bottle and box shown for reference. Confirm the supplied size, box and cap with the seller.'+(update.referenceNote?' '+update.referenceNote:''):'';}

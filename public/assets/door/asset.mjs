import {orientation} from './orientation.mjs';
export {orientation};
import {openAsset} from './loader.mjs';
// Runtime bundled into every asset.mjs. The application supplies its installed THREE.
// Compressed resources are relative files; serve this entire directory over HTTP(S).
export const metadata = Object.freeze({orientation,"schema":"asset-web-module/1","itemId":"01-L1-0006","name":"镶板门","defaultState":"closed","sourceUpAxis":"Z","units":"metres","geometryEncoding":"float32-le-base64","textureEncoding":"lossless-png","profile":"STATE","unifiedMaterials":{"d49524538c2ea8979f2a287eb734b72f4efa009c3f3b6144a2362f7108107e95":{"finish_id":"wood.generic.dark_brown","family":"wood","recipe_version":"1.0.0","canonical_material_id":"wood.generic.dark_brown","canonical_recipe_sha256":"f6008ae443a261c4064c0df2add36075e961a503978004b38d56b352c10a696e","mode":"standard","material_source":"Actual final saved native shader; freshly baked PBR channels."},"027140eef7b0e3b68992f70a949a82c07387387ecfbcd107e509600796bbe4b6":{"finish_id":"wood.generic.dark_brown","family":"wood","recipe_version":"1.0.0","canonical_material_id":"wood.generic.dark_brown","canonical_recipe_sha256":"f6008ae443a261c4064c0df2add36075e961a503978004b38d56b352c10a696e","mode":"standard","material_source":"Actual final saved native shader; freshly baked PBR channels."},"cf5b1b3a7682a59c3cd6317189b2665c1814d17e8519751f8913d9cf1b6c9bd6":{"finish_id":"wood.generic.dark_brown","family":"wood","recipe_version":"1.0.0","canonical_material_id":"wood.generic.dark_brown","canonical_recipe_sha256":"f6008ae443a261c4064c0df2add36075e961a503978004b38d56b352c10a696e","mode":"standard","material_source":"Actual final saved native shader; freshly baked PBR channels."},"8cd23d602174f2f860831d0b38de4b2be540951a9118bfc72a9988a297b3503e":{"finish_id":"metal.steel.gunmetal","family":"metal","recipe_version":"1.0.0","canonical_material_id":"metal.steel.gunmetal","canonical_recipe_sha256":"12cc1664f26f74762cc54f7929d9da4d81878bab47b3e5cc78ba54c6e0bb71c9","mode":"standard","material_source":"Actual final saved native shader; freshly baked PBR channels."},"8cf5a90f1711c3b3686dfa97a12741d4951ebfe93222f76440a54c186f375879":{"finish_id":"wood.generic.dark_brown","family":"wood","recipe_version":"1.0.0","canonical_material_id":"wood.generic.dark_brown","canonical_recipe_sha256":"f6008ae443a261c4064c0df2add36075e961a503978004b38d56b352c10a696e","mode":"standard","material_source":"Actual final saved native shader; freshly baked PBR channels."},"4e8ace9a107ba4052177279c4fa7f707981de7373c2e836ef8cc27b384193985":{"finish_id":"wood.generic.dark_brown","family":"wood","recipe_version":"1.0.0","canonical_material_id":"wood.generic.dark_brown","canonical_recipe_sha256":"f6008ae443a261c4064c0df2add36075e961a503978004b38d56b352c10a696e","mode":"standard","material_source":"Actual final saved native shader; freshly baked PBR channels."},"62580a0fafbbc6bddc97b779b8f163530e7d2f55b88dbd082db71145747ded0e":{"finish_id":"wood.generic.dark_brown","family":"wood","recipe_version":"1.0.0","canonical_material_id":"wood.generic.dark_brown","canonical_recipe_sha256":"f6008ae443a261c4064c0df2add36075e961a503978004b38d56b352c10a696e","mode":"standard","material_source":"Actual final saved native shader; freshly baked PBR channels."},"3e45f5f34499aada3dca68b702554984c8a1a587eadaf9cd1eeeb3f2a5b10dc6":{"finish_id":"wood.generic.dark_brown","family":"wood","recipe_version":"1.0.0","canonical_material_id":"wood.generic.dark_brown","canonical_recipe_sha256":"f6008ae443a261c4064c0df2add36075e961a503978004b38d56b352c10a696e","mode":"standard","material_source":"Actual final saved native shader; freshly baked PBR channels."},"8ca0274c07d7e838e69dcb9cbbd0e545f2164f5d3ee9cd6b876b7d2cd3279722":{"finish_id":"wood.generic.dark_brown","family":"wood","recipe_version":"1.0.0","canonical_material_id":"wood.generic.dark_brown","canonical_recipe_sha256":"f6008ae443a261c4064c0df2add36075e961a503978004b38d56b352c10a696e","mode":"standard","material_source":"Actual final saved native shader; freshly baked PBR channels."},"a2d9e3c977c549b63b31a1ff5997b6be55fff82fdeb03881f5a78c85d41c6eed":{"finish_id":"wood.generic.dark_brown","family":"wood","recipe_version":"1.0.0","canonical_material_id":"wood.generic.dark_brown","canonical_recipe_sha256":"f6008ae443a261c4064c0df2add36075e961a503978004b38d56b352c10a696e","mode":"standard","material_source":"Actual final saved native shader; freshly baked PBR channels."},"05b26aef92ef9011ffcf218cba4dd0bd49d5f4bd71c1c6a9a99287edafcb01d6":{"finish_id":"wood.generic.dark_brown","family":"wood","recipe_version":"1.0.0","canonical_material_id":"wood.generic.dark_brown","canonical_recipe_sha256":"f6008ae443a261c4064c0df2add36075e961a503978004b38d56b352c10a696e","mode":"standard","material_source":"Actual final saved native shader; freshly baked PBR channels."},"fd5db5bb8a1f872331598d7a9c4ccf81e7ac3c1c06224ac447bd306092d3ac26":{"finish_id":"wood.generic.dark_brown","family":"wood","recipe_version":"1.0.0","canonical_material_id":"wood.generic.dark_brown","canonical_recipe_sha256":"f6008ae443a261c4064c0df2add36075e961a503978004b38d56b352c10a696e","mode":"standard","material_source":"Actual final saved native shader; freshly baked PBR channels."},"8e10b6ca7deccd91bfbfa8b182f780a83feddc1fd64bc9b0644a59b0bbb99f7f":{"finish_id":"wood.generic.dark_brown","family":"wood","recipe_version":"1.0.0","canonical_material_id":"wood.generic.dark_brown","canonical_recipe_sha256":"f6008ae443a261c4064c0df2add36075e961a503978004b38d56b352c10a696e","mode":"standard","material_source":"Actual final saved native shader; freshly baked PBR channels."},"d0138fd17ffd30f733670fc48248923d260e5767eb38b2080fc9901d7b300d9c":{"finish_id":"wood.generic.dark_brown","family":"wood","recipe_version":"1.0.0","canonical_material_id":"wood.generic.dark_brown","canonical_recipe_sha256":"f6008ae443a261c4064c0df2add36075e961a503978004b38d56b352c10a696e","mode":"standard","material_source":"Actual final saved native shader; freshly baked PBR channels."},"d58c96495546d624c7a31363c031cb100ff6d7da04311709e8e5140388e7afd6":{"finish_id":"wood.generic.dark_brown","family":"wood","recipe_version":"1.0.0","canonical_material_id":"wood.generic.dark_brown","canonical_recipe_sha256":"f6008ae443a261c4064c0df2add36075e961a503978004b38d56b352c10a696e","mode":"standard","material_source":"Actual final saved native shader; freshly baked PBR channels."},"a51bb61acb32bd706799bdcfeffd881ec44e26fd24d43123c9b954d59679a380":{"finish_id":"wood.generic.dark_brown","family":"wood","recipe_version":"1.0.0","canonical_material_id":"wood.generic.dark_brown","canonical_recipe_sha256":"f6008ae443a261c4064c0df2add36075e961a503978004b38d56b352c10a696e","mode":"standard","material_source":"Actual final saved native shader; freshly baked PBR channels."},"b64055c42e372f5bf044436300ee998e36f6bd30e4f2d7ba05ce3bec714ebabf":{"finish_id":"wood.generic.dark_brown","family":"wood","recipe_version":"1.0.0","canonical_material_id":"wood.generic.dark_brown","canonical_recipe_sha256":"f6008ae443a261c4064c0df2add36075e961a503978004b38d56b352c10a696e","mode":"standard","material_source":"Actual final saved native shader; freshly baked PBR channels."},"3b433a1d5523681b6b952e6d6e5ba60424e6c518e44dfde202eb171540092591":{"finish_id":"wood.generic.dark_brown","family":"wood","recipe_version":"1.0.0","canonical_material_id":"wood.generic.dark_brown","canonical_recipe_sha256":"f6008ae443a261c4064c0df2add36075e961a503978004b38d56b352c10a696e","mode":"standard","material_source":"Actual final saved native shader; freshly baked PBR channels."},"e801e7108b863aeb588cd35290672438c9fbd6d2b1626414c7dbe1a4b2d351e6":{"finish_id":"wood.generic.dark_brown","family":"wood","recipe_version":"1.0.0","canonical_material_id":"wood.generic.dark_brown","canonical_recipe_sha256":"f6008ae443a261c4064c0df2add36075e961a503978004b38d56b352c10a696e","mode":"standard","material_source":"Actual final saved native shader; freshly baked PBR channels."},"3bec2493cd817d4ea1a7983c1f1d5bcf8359944b92ddc78520dc59be9d1b1e72":{"finish_id":"wood.generic.dark_brown","family":"wood","recipe_version":"1.0.0","canonical_material_id":"wood.generic.dark_brown","canonical_recipe_sha256":"f6008ae443a261c4064c0df2add36075e961a503978004b38d56b352c10a696e","mode":"standard","material_source":"Actual final saved native shader; freshly baked PBR channels."},"cfa4d1aa6d0c13c9e03af0ea16acc3b9c7bf6be070e937a24554134783c10fe2":{"finish_id":"wood.generic.dark_brown","family":"wood","recipe_version":"1.0.0","canonical_material_id":"wood.generic.dark_brown","canonical_recipe_sha256":"f6008ae443a261c4064c0df2add36075e961a503978004b38d56b352c10a696e","mode":"standard","material_source":"Actual final saved native shader; freshly baked PBR channels."},"8aa30872aed8a94a8c9ada81ff967361103747dfb89dcda26c7b9dd7472bd2e4":{"finish_id":"wood.generic.dark_brown","family":"wood","recipe_version":"1.0.0","canonical_material_id":"wood.generic.dark_brown","canonical_recipe_sha256":"f6008ae443a261c4064c0df2add36075e961a503978004b38d56b352c10a696e","mode":"standard","material_source":"Actual final saved native shader; freshly baked PBR channels."},"78324b78a2590e80f2dbf5c53de08b0dd546227004190528447f202e6f33daef":{"finish_id":"wood.generic.dark_brown","family":"wood","recipe_version":"1.0.0","canonical_material_id":"wood.generic.dark_brown","canonical_recipe_sha256":"f6008ae443a261c4064c0df2add36075e961a503978004b38d56b352c10a696e","mode":"standard","material_source":"Actual final saved native shader; freshly baked PBR channels."},"448e6009ed443195391c30a7e9b9247e50e42bf6d2116f821d79f12f67c1c214":{"finish_id":"wood.generic.dark_brown","family":"wood","recipe_version":"1.0.0","canonical_material_id":"wood.generic.dark_brown","canonical_recipe_sha256":"f6008ae443a261c4064c0df2add36075e961a503978004b38d56b352c10a696e","mode":"standard","material_source":"Actual final saved native shader; freshly baked PBR channels."},"7f00c2b25d3c66f5b4b1f752428825fcaefa06f0179519b553e1f2299e11f3bf":{"finish_id":"wood.generic.dark_brown","family":"wood","recipe_version":"1.0.0","canonical_material_id":"wood.generic.dark_brown","canonical_recipe_sha256":"f6008ae443a261c4064c0df2add36075e961a503978004b38d56b352c10a696e","mode":"standard","material_source":"Actual final saved native shader; freshly baked PBR channels."},"ba4f6662ede2ea454a8e8a7d177bf200be6d3de5873377d0d4a6a474b4b8c980":{"finish_id":"wood.generic.dark_brown","family":"wood","recipe_version":"1.0.0","canonical_material_id":"wood.generic.dark_brown","canonical_recipe_sha256":"f6008ae443a261c4064c0df2add36075e961a503978004b38d56b352c10a696e","mode":"standard","material_source":"Actual final saved native shader; freshly baked PBR channels."},"ed58b77fd274244eb73593aa83f9f87011dd552c02ffef1d3bced9aa1b9801d1":{"finish_id":"wood.generic.dark_brown","family":"wood","recipe_version":"1.0.0","canonical_material_id":"wood.generic.dark_brown","canonical_recipe_sha256":"f6008ae443a261c4064c0df2add36075e961a503978004b38d56b352c10a696e","mode":"standard","material_source":"Actual final saved native shader; freshly baked PBR channels."},"01789999def8bdbf556d4631087e06ea32a61f10367716b903a4170290ce5d0a":{"finish_id":"wood.generic.dark_brown","family":"wood","recipe_version":"1.0.0","canonical_material_id":"wood.generic.dark_brown","canonical_recipe_sha256":"f6008ae443a261c4064c0df2add36075e961a503978004b38d56b352c10a696e","mode":"standard","material_source":"Actual final saved native shader; freshly baked PBR channels."},"f11c7ef058694ec65fe1897584cc2bd41c156df594d8b65eec6c13ee7d1bb9c6":{"finish_id":"wood.generic.dark_brown","family":"wood","recipe_version":"1.0.0","canonical_material_id":"wood.generic.dark_brown","canonical_recipe_sha256":"f6008ae443a261c4064c0df2add36075e961a503978004b38d56b352c10a696e","mode":"standard","material_source":"Actual final saved native shader; freshly baked PBR channels."},"35ee05de74e9b1d19e739250ad7da41c7c77874a31631b8c16d61a8ae56e163f":{"finish_id":"wood.generic.dark_brown","family":"wood","recipe_version":"1.0.0","canonical_material_id":"wood.generic.dark_brown","canonical_recipe_sha256":"f6008ae443a261c4064c0df2add36075e961a503978004b38d56b352c10a696e","mode":"standard","material_source":"Actual final saved native shader; freshly baked PBR channels."},"5cfe281ddec9a819e0cfbfca0f4a423cad83487ed04e91d3843b1e886ce80db5":{"finish_id":"wood.generic.dark_brown","family":"wood","recipe_version":"1.0.0","canonical_material_id":"wood.generic.dark_brown","canonical_recipe_sha256":"f6008ae443a261c4064c0df2add36075e961a503978004b38d56b352c10a696e","mode":"standard","material_source":"Actual final saved native shader; freshly baked PBR channels."},"3ed1af4551a8d8ab1fd5b138221d1d30d644aaf186cd2a7f9e3f09f530f8ccfc":{"finish_id":"wood.generic.dark_brown","family":"wood","recipe_version":"1.0.0","canonical_material_id":"wood.generic.dark_brown","canonical_recipe_sha256":"f6008ae443a261c4064c0df2add36075e961a503978004b38d56b352c10a696e","mode":"standard","material_source":"Actual final saved native shader; freshly baked PBR channels."},"04c7684007d7e38af20709373bcf746c65541ab9102e45d54bed7e33be9c82b7":{"finish_id":"wood.generic.dark_brown","family":"wood","recipe_version":"1.0.0","canonical_material_id":"wood.generic.dark_brown","canonical_recipe_sha256":"f6008ae443a261c4064c0df2add36075e961a503978004b38d56b352c10a696e","mode":"standard","material_source":"Actual final saved native shader; freshly baked PBR channels."},"b9931062dd03415d8f248736d919ae1af572a110881e743ac7edb12fb5feecc9":{"finish_id":"wood.generic.dark_brown","family":"wood","recipe_version":"1.0.0","canonical_material_id":"wood.generic.dark_brown","canonical_recipe_sha256":"f6008ae443a261c4064c0df2add36075e961a503978004b38d56b352c10a696e","mode":"standard","material_source":"Actual final saved native shader; freshly baked PBR channels."},"a5414ed3855d64ddb33992cc8c743db2e997e568beffa782130023f6d7aaffe4":{"finish_id":"wood.generic.dark_brown","family":"wood","recipe_version":"1.0.0","canonical_material_id":"wood.generic.dark_brown","canonical_recipe_sha256":"f6008ae443a261c4064c0df2add36075e961a503978004b38d56b352c10a696e","mode":"standard","material_source":"Actual final saved native shader; freshly baked PBR channels."},"0a4c3a360b0a65c5f6a6eb0d47d9ca3a0ff65266fcdbcca672c66657633a755a":{"finish_id":"wood.generic.dark_brown","family":"wood","recipe_version":"1.0.0","canonical_material_id":"wood.generic.dark_brown","canonical_recipe_sha256":"f6008ae443a261c4064c0df2add36075e961a503978004b38d56b352c10a696e","mode":"standard","material_source":"Actual final saved native shader; freshly baked PBR channels."},"0884c3487b69ed3c2ea1dfd1b44fc69bde418e9b38bb13e2412c483fbf85ccc6":{"finish_id":"wood.generic.dark_brown","family":"wood","recipe_version":"1.0.0","canonical_material_id":"wood.generic.dark_brown","canonical_recipe_sha256":"f6008ae443a261c4064c0df2add36075e961a503978004b38d56b352c10a696e","mode":"standard","material_source":"Actual final saved native shader; freshly baked PBR channels."},"086c6a60f0125a15e41ec28afdfad515d780fb9ba93d2f78e4f3094208b61081":{"finish_id":"wood.generic.dark_brown","family":"wood","recipe_version":"1.0.0","canonical_material_id":"wood.generic.dark_brown","canonical_recipe_sha256":"f6008ae443a261c4064c0df2add36075e961a503978004b38d56b352c10a696e","mode":"standard","material_source":"Actual final saved native shader; freshly baked PBR channels."},"7fd0d97333e2f15cb7864f466393b8605df3de1ab929d141c99dc146bb0b28e0":{"finish_id":"wood.generic.dark_brown","family":"wood","recipe_version":"1.0.0","canonical_material_id":"wood.generic.dark_brown","canonical_recipe_sha256":"f6008ae443a261c4064c0df2add36075e961a503978004b38d56b352c10a696e","mode":"standard","material_source":"Actual final saved native shader; freshly baked PBR channels."},"9f78f05f47d1e80ffe87a24c571a3bba1311d20e4308ea4532a12986a99ee301":{"finish_id":"wood.generic.dark_brown","family":"wood","recipe_version":"1.0.0","canonical_material_id":"wood.generic.dark_brown","canonical_recipe_sha256":"f6008ae443a261c4064c0df2add36075e961a503978004b38d56b352c10a696e","mode":"standard","material_source":"Actual final saved native shader; freshly baked PBR channels."},"c985b97f837d71948936427bf26181ef57fec79d97671804197f77952ce86bf0":{"finish_id":"wood.generic.dark_brown","family":"wood","recipe_version":"1.0.0","canonical_material_id":"wood.generic.dark_brown","canonical_recipe_sha256":"f6008ae443a261c4064c0df2add36075e961a503978004b38d56b352c10a696e","mode":"standard","material_source":"Actual final saved native shader; freshly baked PBR channels."},"3a0b1c1980b2329576640cf82cdbb42c90f649cd555fca30948774ca5f3efb79":{"finish_id":"wood.generic.dark_brown","family":"wood","recipe_version":"1.0.0","canonical_material_id":"wood.generic.dark_brown","canonical_recipe_sha256":"f6008ae443a261c4064c0df2add36075e961a503978004b38d56b352c10a696e","mode":"standard","material_source":"Actual final saved native shader; freshly baked PBR channels."},"efcf80ba747c2eeff7fa58545182cddec03ebb40ba03fff901c5be827e8d9c09":{"finish_id":"wood.generic.dark_brown","family":"wood","recipe_version":"1.0.0","canonical_material_id":"wood.generic.dark_brown","canonical_recipe_sha256":"f6008ae443a261c4064c0df2add36075e961a503978004b38d56b352c10a696e","mode":"standard","material_source":"Actual final saved native shader; freshly baked PBR channels."},"b76daac0b64e1a41e0af4b20b7740f711d52b1265275d76fe4a613479ecf7a4e":{"finish_id":"wood.generic.dark_brown","family":"wood","recipe_version":"1.0.0","canonical_material_id":"wood.generic.dark_brown","canonical_recipe_sha256":"f6008ae443a261c4064c0df2add36075e961a503978004b38d56b352c10a696e","mode":"standard","material_source":"Actual final saved native shader; freshly baked PBR channels."},"ee3265ee1027696b9c7b2564d8256e7a0b2a7d5bbb074eda5a6cd5eecd0abc22":{"finish_id":"wood.generic.dark_brown","family":"wood","recipe_version":"1.0.0","canonical_material_id":"wood.generic.dark_brown","canonical_recipe_sha256":"f6008ae443a261c4064c0df2add36075e961a503978004b38d56b352c10a696e","mode":"standard","material_source":"Actual final saved native shader; freshly baked PBR channels."},"58592ffede3fcbfa52316feb6773ffbc1d075d43af1a5bb6cd28fec6e79c6f98":{"finish_id":"wood.generic.dark_brown","family":"wood","recipe_version":"1.0.0","canonical_material_id":"wood.generic.dark_brown","canonical_recipe_sha256":"f6008ae443a261c4064c0df2add36075e961a503978004b38d56b352c10a696e","mode":"standard","material_source":"Actual final saved native shader; freshly baked PBR channels."},"b8cd7fc7deb93e5f83dc728ce56643de15a13be180a9a332b45362e5ee8497a1":{"finish_id":"wood.generic.dark_brown","family":"wood","recipe_version":"1.0.0","canonical_material_id":"wood.generic.dark_brown","canonical_recipe_sha256":"f6008ae443a261c4064c0df2add36075e961a503978004b38d56b352c10a696e","mode":"standard","material_source":"Actual final saved native shader; freshly baked PBR channels."},"bc9ed3ab1dd1017667ca3332409e94e31b24167dbdf149321399eb3446cbe1e6":{"finish_id":"wood.generic.dark_brown","family":"wood","recipe_version":"1.0.0","canonical_material_id":"wood.generic.dark_brown","canonical_recipe_sha256":"f6008ae443a261c4064c0df2add36075e961a503978004b38d56b352c10a696e","mode":"standard","material_source":"Actual final saved native shader; freshly baked PBR channels."},"c8adc9d39c985dcf7fa72cb89c5eb26e6c73319e85f43d36c3313a552889909e":{"finish_id":"wood.generic.dark_brown","family":"wood","recipe_version":"1.0.0","canonical_material_id":"wood.generic.dark_brown","canonical_recipe_sha256":"f6008ae443a261c4064c0df2add36075e961a503978004b38d56b352c10a696e","mode":"standard","material_source":"Actual final saved native shader; freshly baked PBR channels."},"84fbbbe9796075b16c0a9b43320389a85f5c72cb8d6d2721ab8b0a18350a9e94":{"finish_id":"wood.generic.dark_brown","family":"wood","recipe_version":"1.0.0","canonical_material_id":"wood.generic.dark_brown","canonical_recipe_sha256":"f6008ae443a261c4064c0df2add36075e961a503978004b38d56b352c10a696e","mode":"standard","material_source":"Actual final saved native shader; freshly baked PBR channels."},"02a342e4fe85672c9523900f4d684ea6cca55391dc243661da546a981e1c298e":{"finish_id":"wood.generic.dark_brown","family":"wood","recipe_version":"1.0.0","canonical_material_id":"wood.generic.dark_brown","canonical_recipe_sha256":"f6008ae443a261c4064c0df2add36075e961a503978004b38d56b352c10a696e","mode":"standard","material_source":"Actual final saved native shader; freshly baked PBR channels."},"90fa42fc5e6b02f891b729987ee430704937d88446be28e331cc42f53ca8cafb":{"finish_id":"wood.generic.dark_brown","family":"wood","recipe_version":"1.0.0","canonical_material_id":"wood.generic.dark_brown","canonical_recipe_sha256":"f6008ae443a261c4064c0df2add36075e961a503978004b38d56b352c10a696e","mode":"standard","material_source":"Actual final saved native shader; freshly baked PBR channels."}},"styleV2":{"revision":"deadline-v2-fbf00147f52ff6aaf682","registry":{"path":null,"sha256":"51c619d2c2291d145be79878ed9c8b2572a9705b98b82fcb01ce554e458547aa"},"mappingSha256":"7b1c4df95148112083ff6d239c198762542329ebf0f40f41a2412ca131ffb7a6","mode":"standard","sourceStateBlendSha256":{"closed":"1acda80678d0178a36b05597a376a7991a40e8568d9de1873124cde8aefcfde5","open":"f840e1bbcb1f308bf8f38061bd5a81a2aa471b7204fa81b3df7c78a1a79ce469"}},"limitations":["Saved states exposed in Web; public parametric generation remains in source/build.py.","Final native PBR channels are finite-resolution UV textures; Cycles and three.js lighting are not pixel-identical.","The native shared library is hash-bound at the registry workspace path."]});
export const availableStates = Object.freeze(["closed","open"]);

export async function createAsset(THREE, options = {}) {
  if (!THREE?.Group || !THREE?.BufferGeometry || !THREE?.MeshPhysicalMaterial)
    throw new TypeError('Pass the three.js namespace to createAsset(THREE, options)');
  const requested = options.state ?? metadata.defaultState;
  const session = await openAsset(THREE, new URL('./', import.meta.url), options);
  const DATA = session.data;
  try {
  if (!DATA.states[requested]) throw new RangeError(`Unknown asset state: ${requested}`);
  const geometries = session.geometries, materials = new Map(), textures = session.textures;
  const floats = session.array;
  const root = new THREE.Group();
  root.name = metadata.name;
  root.userData.asset = metadata;
  root.userData.availableStates = [...availableStates];
  if ((options.upAxis ?? 'Y') === 'Y') root.rotation.x = -Math.PI / 2;
  else if (options.upAxis !== 'Z') throw new RangeError('upAxis must be Y or Z');
  const loadTexture = options.loadTexture ?? ((uri) => new THREE.TextureLoader().loadAsync(uri));
  async function texture(id, color) {
    const key = `${id}:${color}`;
    if (!textures.has(key)) textures.set(key, (async () => {
      const t = await session.loadTexture(session.uri(id), loadTexture);
      t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.flipY = true; // native Blender UVs, unlike the glTF convention
      t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
      // Continuous coverage proof bounds the exact level-zero bilinear footprint.
      t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter;
      t.needsUpdate = true;
      return t;
    })());
    return textures.get(key);
  }
  async function material(id) {
    if (!materials.has(id)) materials.set(id, (async () => {
      const d = DATA.materials[id], p = d.properties;
      const m = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(...p.color), metalness: p.metalness,
        roughness: p.roughness, opacity: p.opacity, transparent: p.transparent,
        ior: p.ior, transmission: p.transmission, clearcoat: p.clearcoat,
        clearcoatRoughness: p.clearcoatRoughness,
        emissive: new THREE.Color(...p.emissive), emissiveIntensity: p.emissiveIntensity,
        specularIntensity: p.specularIntensity, specularColor: new THREE.Color(...p.specularColor),
        sheen: p.sheen ?? 0, sheenColor: new THREE.Color(...(p.sheenColor ?? [1,1,1])),
        sheenRoughness: p.sheenRoughness ?? .5,
        anisotropy: p.anisotropy ?? 0, anisotropyRotation: p.anisotropyRotation ?? 0,
        side: THREE.DoubleSide,
        vertexColors: Boolean(d.vertexColor),
      });
      m.name = d.name; m.userData.blenderMaterial = d.name;
      Object.assign(m.userData, DATA.metadata.unifiedMaterials[id]);
      if (d.vertexColor) m.userData.vertexColorContract = d.vertexColor;
      if (d.vertexColor?.emission_vertex_multiplier) {
        // Three's ordinary vertex color path affects diffuse/alpha only.
        // The native source feeds the same interpolated RGB to emission too.
        m.onBeforeCompile = shader => {
          const token = '#include <emissivemap_fragment>';
          if (shader.fragmentShader.split(token).length !== 2) throw new Error('Unsupported Three emission shader boundary');
          shader.fragmentShader = shader.fragmentShader.replace(token, token + '\n#if defined(USE_COLOR) || defined(USE_COLOR_ALPHA)\n totalEmissiveRadiance *= vColor.rgb;\n#endif\n');
        };
        m.customProgramCacheKey = () => 'native-vertex-rgb-emission-v1';
      }
      for (const [prop, tex] of Object.entries(d.maps))
        m[prop] = await texture(tex, prop === 'map' || prop === 'emissiveMap' || prop === 'specularColorMap');
      return m;
    })());
    return materials.get(id);
  }
  function geometry(id) {
    if (!geometries.has(id)) {
      const d = DATA.geometries[id], g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(floats(d.position), 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(floats(d.normal), 3));
      if (d.color) g.setAttribute('color', new THREE.Float32BufferAttribute(floats(d.color), 4));
      const uv = floats(d.uv);
      if (uv.length) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      if (d.index) g.setIndex(new THREE.BufferAttribute(floats(d.index), 1));
      for (const [start, count, slot] of d.groups) g.addGroup(start, count, slot);
      g.computeBoundingBox(); g.computeBoundingSphere();
      geometries.set(id, g);
    }
    return geometries.get(id);
  }
  // States are actual saved Blender scenes. Swapping states does not pretend that
  // arbitrary procedural Python parameters are available as JavaScript parameters.
  const stateGroups = new Map();
  const building = new Map();
  let disposed = false;
  async function buildState(name) {
    if (disposed) throw new Error('Asset has been disposed');
    if (stateGroups.has(name)) return;
    await session.prepare(name);
    const state = DATA.states[name];
    await Promise.all([...new Set(state.nodes.flatMap(n => n.materials || []).filter(id => id !== null))].map(material));
    const container = new THREE.Group(); container.name = `state:${name}`;
    const nodes = new Map();
    for (const d of state.nodes) {
      const o = d.geometry
        ? new THREE.Mesh(geometry(d.geometry), await Promise.all(d.materials.map(material)))
        : new THREE.Group();
      o.name = d.name; o.visible = d.visible;
      o.matrix.fromArray(d.matrix); o.matrix.decompose(o.position, o.quaternion, o.scale);
      o.matrixAutoUpdate = false;
      o.userData = {...d.properties, blenderType: d.type, assetNode: d.name};
      o.castShadow = true; o.receiveShadow = true; nodes.set(d.name, o);
    }
    for (const d of state.nodes) (nodes.get(d.parent) ?? container).add(nodes.get(d.name));
    container.visible = name === requested;
    root.add(container); stateGroups.set(name, container);
  }
  async function prepareState(name) {
    if (disposed) throw new Error('Asset has been disposed');
    if (!DATA.states[name]) throw new RangeError(`Unknown asset state: ${name}`);
    if (!building.has(name)) building.set(name, buildState(name).catch(e => {building.delete(name);throw e;}));
    await building.get(name);
    return root;
  }
  for (const name of (options.states === 'lazy' ? [requested] : availableStates)) await prepareState(name);
  root.prepareState = prepareState;
  let switchRequest = 0;
  root.setState = (name) => {
    if (disposed) throw new Error('Asset has been disposed');
    const token = ++switchRequest;
    if (!stateGroups.has(name) && DATA.states[name]) return prepareState(name).then(() => token === switchRequest ? root.setState(name) : root);
    if (!stateGroups.has(name)) throw new RangeError(`Unknown asset state: ${name}`);
    for (const [state, group] of stateGroups) group.visible = state === name;
    root.userData.state = name;
    return root;
  };
  root.getStateObject = (name) => stateGroups.get(root.userData.state).getObjectByName(name);
  root.dispose = async () => {
    if (disposed) return; disposed = true;
    await Promise.allSettled(building.values());
    for (const m of materials.values()) (await m).dispose();
    await session.release();
  };
  root.setState(requested); root.updateMatrixWorld(true);
  return root;
  } catch (error) { await session.release(); throw error; }
}

export default createAsset;

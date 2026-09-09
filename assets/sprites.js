/* Crumb — pixel art data and canvas helpers. No dependencies, no external fonts.
 * Every sprite below is hand-drawn on a 12x12 grid; digits and capitals on 3x5.
 * Generated from the source project's sprite table — do not hand-edit. */

const Pixel = (function () {
  const SPRITES = {
    /* 老婆餅 Wife Cake */
    laopo: { palette: { X: "#5C3A1D", b: "#E0A73C", a: "#F3D488", s: "#8A5A22" }, rows: [
      "....XXXX....",
      "..XXbbbbXX..",
      ".XbbaaaabbX.",
      ".XbaaaaaabX.",
      "XbaasaaasabX",
      "XbaaaaaaaabX",
      "XbaaasaaaabX",
      "XbaaaaaaaabX",
      ".XbaaaaaabX.",
      ".XbbaaaabbX.",
      "..XXbbbbXX..",
      "....XXXX....",
    ] },
    /* 蛋撻 Egg Tart */
    tart: { palette: { X: "#7A4A1E", c: "#E9A94A", d: "#BE7A28", y: "#F0A93A", Y: "#F8CE5C" }, rows: [
      "............",
      "............",
      ".XcXdXcXdXc.",
      "XcdcdcdcdcdX",
      "XyyyyyyyyyyX",
      "XyyYYYYYYyyX",
      ".XyYYYYYYyX.",
      ".XyyYYYYyyX.",
      "..XyyyyyyX..",
      "..XdcdcdcX..",
      "...XXXXXX...",
      "............",
    ] },
    /* 菠蘿包 Pineapple Bun */
    bolo: { palette: { X: "#7A4A1E", b: "#F2C65C", g: "#C9902F", d: "#A8752A" }, rows: [
      "............",
      "...XXXXXX...",
      "..XbgbbgbbX.",
      ".XbbgbbgbbgX",
      ".XgbbgbbgbbX",
      "XbbgbbgbbgbX",
      "XbgbbgbbgbbX",
      "XbbbbbbbbbbX",
      "XdddddddddX.",
      ".XXXXXXXX...",
      "............",
      "............",
    ] },
    /* 雞尾包 Cocktail Bun */
    gaimei: { palette: { X: "#7A4A1E", b: "#E2A94F", w: "#F7E3B8", s: "#5C3A1D" }, rows: [
      "............",
      "............",
      "..XXXXXXXX..",
      ".XbbbbbbbbX.",
      "XbwsbbwsbbwX",
      "XbbbbbbbbbbX",
      "XbwbbwsbbwbX",
      ".XbbbbbbbbX.",
      "..XXXXXXXX..",
      "............",
      "............",
      "............",
    ] },
    /* 腸仔包 Sausage Bun */
    sausage: { palette: { X: "#7A4A1E", b: "#E7B15C", r: "#C4483C", y: "#FBF0D0", d: "#A8752A" }, rows: [
      "............",
      "............",
      "............",
      "..XXXXXXXX..",
      ".XbyybbyybX.",
      "XbrrrrrrrrbX",
      "XbrryyrrrrbX",
      "XbbbbbbbbbbX",
      ".XdddddddX..",
      "..XXXXXXX...",
      "............",
      "............",
    ] },
    /* 三角蛋糕 Triangle Cake */
    caketriangle: { palette: { X: "#7A4A1E", k: "#4A2A14", c: "#F2D9A8", w: "#FBF3E0", r: "#C4483C" }, rows: [
      "............",
      ".........rr.",
      "........XkkX",
      ".......XkkkX",
      "......XkkkkX",
      ".....XcccccX",
      "....XwwwwwwX",
      "...XcccccccX",
      "..XwwwwwwwwX",
      ".XcccccccccX",
      ".XXXXXXXXXXX",
      "............",
    ] },
    /* 紙包蛋糕 Paper-Wrapped Cake */
    papercake: { palette: { X: "#7A4A1E", s: "#F2CE86", p: "#EDE2CC", l: "#C9B89A" }, rows: [
      "............",
      "...XXXXXX...",
      "..XssssssX..",
      ".XssssssssX.",
      "XssssssssssX",
      "XXXXXXXXXXXX",
      "XplppllppplX",
      ".XplppllplX.",
      ".XplppllplX.",
      "..XXXXXXXX..",
      "............",
      "............",
    ] },
    /* 瑞士卷 Swiss Roll */
    swissroll: { palette: { X: "#7A4A1E", c: "#F3D9A0", k: "#C4704A", w: "#FBF0DA" }, rows: [
      "............",
      "...XXXXXX...",
      "..XccccccX..",
      ".XcckkkkccX.",
      "XcckwwwwkccX",
      "XckwkkkkwkcX",
      "XckwkkkkwkcX",
      "XcckwwwwkccX",
      ".XcckkkkccX.",
      "..XccccccX..",
      "...XXXXXX...",
      "............",
    ] },
    /* 菠蘿油 Pineapple Bun with Butter */
    boloyau: { palette: { X: "#7A4A1E", b: "#F0C053", g: "#C98E2E", y: "#FFF2A6" }, rows: [
      "............",
      "...XXXXXX...",
      "..XbgbbgbX..",
      ".XbgbbgbbgX.",
      "XbgbbgbbgbbX",
      "XbbbbbbbbbbX",
      "XyyyyyyyyyyX",
      "XbbbbbbbbbbX",
      ".XXXXXXXXXX.",
      "............",
      "............",
      "............",
    ] },
    /* 椰撻 Coconut Tart */
    coconuttart: { palette: { X: "#7A4A1E", c: "#E9A94A", d: "#BE7A28", w: "#FBF3E0", e: "#E4D6B4" }, rows: [
      "............",
      "............",
      ".XcXdXcXdXc.",
      "XcdcdcdcdcdX",
      "XwwewwewwewX",
      "XewwewwewweX",
      ".XwwewwewwX.",
      ".XewwewwewX.",
      "..XwwwwwwX..",
      "..XdcdcdcX..",
      "...XXXXXX...",
      "............",
    ] },
    /* 蛋黃酥 Egg Yolk Pastry */
    eggyolk: { palette: { X: "#7A4A1E", b: "#EDBE6A", y: "#E8940F", Y: "#FBC44A" }, rows: [
      "............",
      "....XXXX....",
      "..XXbbbbXX..",
      ".XbbbbbbbbX.",
      ".XbbyyyybbX.",
      "XbbyYYYYybbX",
      "XbbyYYYYybbX",
      ".XbbyyyybbX.",
      ".XbbbbbbbbX.",
      "..XXbbbbXX..",
      "....XXXX....",
      "............",
    ] },
    /* 皮蛋酥 Century Egg Pastry */
    centuryegg: { palette: { X: "#7A4A1E", b: "#E3AC55", p: "#55584A" }, rows: [
      "............",
      "....XXXX....",
      "..XXbbbbXX..",
      ".XbbbbbbbbX.",
      ".XbbppppbbX.",
      "XbbppppppbbX",
      "XbbppppppbbX",
      ".XbbppppbbX.",
      ".XbbbbbbbbX.",
      "..XXbbbbXX..",
      "....XXXX....",
      "............",
    ] },
    /* 芋頭酥 Taro Pastry */
    taro: { palette: { X: "#6E4E86", w: "#F6EFE4", v: "#9B6BB5" }, rows: [
      "............",
      "....XXXX....",
      "..XXvvvvXX..",
      ".XwwwwwwwwX.",
      ".XvvvvvvvvX.",
      "XwwwwwwwwwwX",
      "XvvvvvvvvvvX",
      "XwwwwwwwwwwX",
      ".XXXXXXXXXX.",
      "............",
      "............",
      "............",
    ] },
    /* 嫁女餅 Bridal Cake */
    bridecake: { palette: { X: "#B8862B", y: "#F2CE4A", r: "#C0392B", w: "#FFF6E0" }, rows: [
      "....XXXX....",
      "..XXyyyyXX..",
      ".XyrrrrrryX.",
      "XyyrwwwwryyX",
      "XyyrrwwrryyX",
      "XyyrwwwwryyX",
      "XyyrrrrrryyX",
      ".XyyyyyyyyX.",
      "..XXyyyyXX..",
      "....XXXX....",
      "............",
      "............",
    ] },
    /* 龍鳳餅 Dragon & Phoenix Cake */
    dragonphoenix: { palette: { X: "#7A4A1E", b: "#E8B450", d: "#B9822C" }, rows: [
      "............",
      "..XXXXXXXX..",
      ".XbbbbbbbbX.",
      "XbbddddddbbX",
      "XbdbbbbbbdbX",
      "XbdbddddbdbX",
      "XbdbddddbdbX",
      "XbdbbbbbbdbX",
      "XbbddddddbbX",
      ".XbbbbbbbbX.",
      "..XXXXXXXX..",
      "............",
    ] },
    /* 綠豆糕 Mung Bean Cake */
    mungbean: { palette: { X: "#8A9464", g: "#DCE0B8", G: "#B0B888" }, rows: [
      "............",
      ".XXXXXXXXXX.",
      "XggggggggggX",
      "XggggGGggggX",
      "XggGGGGGGggX",
      "XggGGGGGGggX",
      "XggggGGggggX",
      "XggggggggggX",
      ".XXXXXXXXXX.",
      "............",
      "............",
      "............",
    ] },
    /* 綠茶紅豆糯米糍 Green Tea Red Bean Mochi */
    mochi: { palette: { X: "#6B7F3E", g: "#AFC86E", G: "#C6D98C", r: "#8A4A44" }, rows: [
      "............",
      "....XXXX....",
      "..XXggggXX..",
      ".XggGGggggX.",
      "XgggrrrrgggX",
      "XggrrrrrrggX",
      "XgggrrrrgggX",
      ".XggggGGggX.",
      "..XXggggXX..",
      "....XXXX....",
      "............",
      "............",
    ] },
    /* 叉燒酥 BBQ Pork Puff */
    charsiu: { palette: { X: "#7A4A1E", b: "#EDB863", r: "#B03A2E", s: "#5C3A1D" }, rows: [
      "............",
      "..XXXXXXXX..",
      ".XbbbbbbbbX.",
      "XbbbrrrrbbbX",
      "XbbbbbbbbbbX",
      "XbsbbsbbsbbX",
      "XbbbbbbbbbbX",
      ".XbbbbbbbbX.",
      "..XXXXXXXX..",
      "............",
      "............",
      "............",
    ] },
    /* 核桃酥 Walnut Cookie */
    walnut: { palette: { X: "#8A5A22", c: "#D69C44", k: "#7A4A1E" }, rows: [
      "............",
      "...XXXXXX...",
      "..XccccccX..",
      ".XckccckccX.",
      "XcckcckcckcX",
      "XccckccckccX",
      "XcckcccckccX",
      ".XccckcckcX.",
      "..XccccccX..",
      "...XXXXXX...",
      "............",
      "............",
    ] },
    /* 雞批 Chicken Pie */
    chickenpie: { palette: { X: "#7A4A1E", b: "#E8B04E", d: "#B87F2A", k: "#6B4423" }, rows: [
      "............",
      "............",
      "..XXXXXXXX..",
      ".XdbdbbdbdX.",
      "XbbbbbbbbbbX",
      "XbbkkbbkkbbX",
      "XbbbbbbbbbbX",
      ".XbbbbbbbbX.",
      "..XXXXXXXX..",
      "............",
      "............",
      "............",
    ] },
    /* 黑森林蛋糕 Black Forest Cake */
    blackforest: { palette: { X: "#2E1A0C", k: "#3A2210", w: "#FBF3E0", r: "#C4483C" }, rows: [
      "............",
      ".........rr.",
      "........XkkX",
      ".......XkkkX",
      "......XkkkkX",
      ".....XkkkkkX",
      "....XwwwwwwX",
      "...XkkkkkkkX",
      "..XwwwwwwwwX",
      ".XkkkkkkkkkX",
      ".XXXXXXXXXXX",
      "............",
    ] },
    /* 芒果慕斯蛋糕 Mango Mousse Cake */
    mango: { palette: { X: "#B8862B", o: "#F5A623", m: "#FBCF6B", w: "#FFFDF4", r: "#C4483C" }, rows: [
      "............",
      ".........rr.",
      "........XooX",
      ".......XoooX",
      "......XmmmmX",
      ".....XmmmmmX",
      "....XmmmmmmX",
      "...XwwwwwwwX",
      "..XwwwwwwwwX",
      ".XwwwwwwwwwX",
      ".XXXXXXXXXXX",
      "............",
    ] },
    /* 杏仁條 Almond Stick */
    almond: { palette: { X: "#A98963", s: "#EFC978", a: "#FFF6E0" }, rows: [
      "............",
      "..XXXXXXXX..",
      ".XsaasaassX.",
      "..XXXXXXXX..",
      "............",
      "..XXXXXXXX..",
      ".XssaasaasX.",
      "..XXXXXXXX..",
      "............",
      "............",
      "............",
      "............",
    ] },
    /* 奶油麵包 Cream Bun */
    creambun: { palette: { X: "#A8792F", b: "#EBB964", c: "#FFF8EC", w: "#FFFDF4" }, rows: [
      "............",
      "............",
      "..XXXXXXXX..",
      ".XbcbwbcbbX.",
      "XbcbbwwbbcbX",
      "XbbcbwwbcbbX",
      "XbcbbbwwbbcX",
      ".XbbcbwwcbX.",
      "..XXXXXXXX..",
      "............",
      "............",
      "............",
    ] },
    /* 蓮蓉蛋黃月餅 Lotus & Egg Yolk Mooncake */
    mooncake: { palette: { X: "#7A4A1E", m: "#D89A3C", d: "#A5691F" }, rows: [
      "............",
      "............",
      "..XXXXXXXX..",
      ".XmddmmddmX.",
      "XmmmmmmmmmmX",
      "XdmdmdmdmdmX",
      "XdmdmdmdmdmX",
      "XmmmmmmmmmmX",
      ".XXXXXXXXXX.",
      "............",
      "............",
      "............",
    ] },
    /* 蝦片 Prawn Cracker */
    shrimpchip: { palette: { X: "#B36A7C", w: "#FFF3F0", p: "#EE8FA4" }, rows: [
      "............",
      "...XXXXXX...",
      "..XppppppX..",
      ".XpwwwwwwpX.",
      "XpwwppppwwpX",
      "XpwpwwwwpwpX",
      "XpwpwppwwwpX",
      "XpwpwwwwwwpX",
      ".XpwwwwwwpX.",
      "..XppppppX..",
      "...XXXXXX...",
      "............",
    ] },
    /* 賀年全盒 New Year Candy Box */
    cnybox: { palette: { X: "#8A2A20", g: "#E8B450", r: "#C0392B" }, rows: [
      "............",
      "...XXXXXX...",
      "..XggggggX..",
      ".XgrrrrrrgX.",
      "XgrrggggrrgX",
      "XgrrggggrrgX",
      "XgrrggggrrgX",
      ".XgrrrrrrgX.",
      "..XggggggX..",
      "...XXXXXX...",
      "............",
      "............",
    ] },
    /* 葡式蛋撻 Portuguese Egg Tart */
    porttart: { palette: { X: "#7A4A1E", c: "#EDD9A8", d: "#C9A86A", y: "#F5C443", k: "#6B3A1A" }, rows: [
      "............",
      "............",
      ".XcXdXcXdXc.",
      "XcdcdcdcdcdX",
      "XyykkyyykkyX",
      "XykyyykkyyyX",
      ".XyykkyyykX.",
      ".XyyyykkyyX.",
      "..XyyyyyyX..",
      "..XdcdcdcX..",
      "...XXXXXX...",
      "............",
    ] },
    /* 鹹蛋黃肉鬆牛軋糖 Salted Yolk Pork Floss Nougat */
    nougat: { palette: { X: "#A98963", c: "#E3C89A", w: "#FFFDF6", y: "#F0C040", f: "#C98A6A" }, rows: [
      "............",
      "..XXXXXXXX..",
      ".XccccccccX.",
      ".XwywwfwywX.",
      ".XwfwywwywX.",
      ".XccccccccX.",
      "..XXXXXXXX..",
      "............",
      "............",
      "............",
      "............",
      "............",
    ] },
    /* 蛋黃棗泥酥 Date & Egg Yolk Pastry */
    datepastry: { palette: { X: "#C77286", p: "#F2A9B8", d: "#5C3826", o: "#F0A020" }, rows: [
      "....XXXX....",
      "..XXppppXX..",
      ".XppddddppX.",
      "XpdddoodddpX",
      "XpddooooddpX",
      "XpdddoodddpX",
      ".XppddddppX.",
      "..XXppppXX..",
      "....XXXX....",
      "............",
      "............",
      "............",
    ] },
    /* 黑芝麻酥 Black Sesame Pastry */
    blacksesamepastry: { palette: { X: "#4A4440", k: "#6B6560", w: "#E8E2DC" }, rows: [
      "............",
      "....XXXX....",
      "..XXkkkkXX..",
      ".XwwwwwwwwX.",
      ".XkkkkkkkkX.",
      "XwwwwwwwwwwX",
      "XkkkkkkkkkkX",
      "XwwwwwwwwwwX",
      ".XXXXXXXXXX.",
      "............",
      "............",
      "............",
    ] },
    /* 黑芝麻糯米糍 Black Sesame Mochi */
    blacksesamemochi: { palette: { X: "#9C8F7A", w: "#FDFBF4", k: "#2E2A26" }, rows: [
      "............",
      "....XXXX....",
      "..XXwwwwXX..",
      ".XwwwwwwwwX.",
      ".XwwkkkkwwX.",
      "XwwkkkkkkwwX",
      ".XwwkkkkwwX.",
      ".XwwwwwwwwX.",
      "..XXwwwwXX..",
      "....XXXX....",
      "............",
      "............",
    ] },
    /* 南瓜子薄脆 Pumpkin Seed Tuile */
    pumpkintuile: { palette: { X: "#B89B5E", t: "#EAD9A8", g: "#7F9A50", s: "#FFFDF4" }, rows: [
      "............",
      "............",
      "............",
      "..XXXXXXXX..",
      ".XtgtstgstX.",
      ".XtstgtstgX.",
      "..XXXXXXXX..",
      "............",
      "............",
      "............",
      "............",
      "............",
    ] },
    /* 芝士熱狗包 Cheese Hot Dog Bun */
    cheesehotdog: { palette: { X: "#A8792F", b: "#E8B85C", c: "#F5D060", r: "#C0392B", e: "#6B8E3E" }, rows: [
      "............",
      "............",
      "...XXXXXX...",
      "..XbbccbbX..",
      "XrrbccccbrrX",
      "..XbbecbbX..",
      "...XXXXXX...",
      "............",
      "............",
      "............",
      "............",
      "............",
    ] },
    /* 開心果奶油號角 Pistachio Cream Horn */
    pistachiohorn: { palette: { X: "#7A4A1E", b: "#E8B04E", d: "#C08A32", g: "#A8C868" }, rows: [
      "............",
      "......XXXXX.",
      ".....XgggggX",
      "....XbdbdbX.",
      "...XbdbdbX..",
      "..XbdbdbX...",
      ".XbdbdX.....",
      ".XbdX.......",
      ".XX.........",
      "............",
      "............",
      "............",
    ] },
    /* 蘿蔔糕 Turnip Cake */
    radishcake: { palette: { X: "#A98963", d: "#D9A050", w: "#F6F0E2", r: "#C0392B" }, rows: [
      "............",
      "............",
      "..XXXXXXXX..",
      ".XddddddddX.",
      ".XwwrwwrwwX.",
      ".XwrwwwwrwX.",
      ".XwwwwrwwwX.",
      "..XXXXXXXX..",
      "............",
      "............",
      "............",
      "............",
    ] },
    /* 芋頭臘腸糕 Taro & Sausage Cake */
    tarocake: { palette: { X: "#7A6472", t: "#C4B2BE", u: "#9A8494", r: "#B03A2E" }, rows: [
      "............",
      "............",
      "..XXXXXXXX..",
      ".XttttttttX.",
      ".XtrtutrttX.",
      ".XttutrtutX.",
      ".XttttttttX.",
      "..XXXXXXXX..",
      "............",
      "............",
      "............",
      "............",
    ] },
    /* 椰汁黃糖年糕 Coconut Brown Sugar Nian Gao */
    ricecake: { palette: { X: "#A5691F", a: "#D98E3F", H: "#F2C878" }, rows: [
      "............",
      "............",
      "..XXXXXXXX..",
      ".XaaHHaaaaX.",
      ".XaaaaHHaaX.",
      ".XaaaaaaaaX.",
      "..XXXXXXXX..",
      "............",
      "............",
      "............",
      "............",
      "............",
    ] },
    /* 栗子蛋糕 Chestnut Cake */
    chestnut: { palette: { X: "#5C3A1D", n: "#6B3F1F", s: "#B07A3E", v: "#96622E", w: "#F3E3C2" }, rows: [
      "....XXXX....",
      "...XnnnnX...",
      "..XnnnnnnX..",
      "..XssssssX..",
      ".XsvsvsvsvX.",
      ".XvsvsvsvsX.",
      "XsvsvsvsvsvX",
      "XvsvsvsvsvsX",
      "XwwwwwwwwwwX",
      ".XXXXXXXXXX.",
      "............",
      "............",
    ] },
  };

  /* Rotation order. Collecting one full lap = $1650 of gift cards received.
   * Changing the count reshuffles everybody's existing collection (forSlot is % len). */
  const CYCLE = ["laopo", "tart", "mungbean", "gaimei", "taro", "caketriangle", "bolo", "mochi", "charsiu", "eggyolk", "swissroll", "sausage", "bridecake", "creambun", "walnut", "mango", "nougat", "coconuttart", "shrimpchip", "boloyau", "papercake", "blackforest", "datepastry", "chickenpie", "almond", "dragonphoenix", "centuryegg", "chestnut", "porttart", "blacksesamemochi", "cheesehotdog", "pumpkintuile", "blacksesamepastry"];

  /* Drawn and named, but deliberately outside the rotation — reserved for seasonal skins. */
  const LIMITED = ["pistachiohorn", "cnybox", "mooncake", "radishcake", "tarocake", "ricecake"];

  const NAMES = {
    laopo: { zh: "老婆餅", en: "Wife Cake" },
    tart: { zh: "蛋撻", en: "Egg Tart" },
    bolo: { zh: "菠蘿包", en: "Pineapple Bun" },
    gaimei: { zh: "雞尾包", en: "Cocktail Bun" },
    sausage: { zh: "腸仔包", en: "Sausage Bun" },
    caketriangle: { zh: "三角蛋糕", en: "Triangle Cake" },
    papercake: { zh: "紙包蛋糕", en: "Paper-Wrapped Cake" },
    swissroll: { zh: "瑞士卷", en: "Swiss Roll" },
    boloyau: { zh: "菠蘿油", en: "Pineapple Bun with Butter" },
    coconuttart: { zh: "椰撻", en: "Coconut Tart" },
    eggyolk: { zh: "蛋黃酥", en: "Egg Yolk Pastry" },
    centuryegg: { zh: "皮蛋酥", en: "Century Egg Pastry" },
    taro: { zh: "芋頭酥", en: "Taro Pastry" },
    bridecake: { zh: "嫁女餅", en: "Bridal Cake" },
    dragonphoenix: { zh: "龍鳳餅", en: "Dragon & Phoenix Cake" },
    mungbean: { zh: "綠豆糕", en: "Mung Bean Cake" },
    mochi: { zh: "綠茶紅豆糯米糍", en: "Green Tea Red Bean Mochi" },
    charsiu: { zh: "叉燒酥", en: "BBQ Pork Puff" },
    walnut: { zh: "核桃酥", en: "Walnut Cookie" },
    chickenpie: { zh: "雞批", en: "Chicken Pie" },
    blackforest: { zh: "黑森林蛋糕", en: "Black Forest Cake" },
    mango: { zh: "芒果慕斯蛋糕", en: "Mango Mousse Cake" },
    almond: { zh: "杏仁條", en: "Almond Stick" },
    creambun: { zh: "奶油麵包", en: "Cream Bun" },
    mooncake: { zh: "蓮蓉蛋黃月餅", en: "Lotus & Egg Yolk Mooncake" },
    shrimpchip: { zh: "蝦片", en: "Prawn Cracker" },
    cnybox: { zh: "賀年全盒", en: "New Year Candy Box" },
    porttart: { zh: "葡式蛋撻", en: "Portuguese Egg Tart" },
    nougat: { zh: "鹹蛋黃肉鬆牛軋糖", en: "Salted Yolk Pork Floss Nougat" },
    datepastry: { zh: "蛋黃棗泥酥", en: "Date & Egg Yolk Pastry" },
    blacksesamepastry: { zh: "黑芝麻酥", en: "Black Sesame Pastry" },
    blacksesamemochi: { zh: "黑芝麻糯米糍", en: "Black Sesame Mochi" },
    pumpkintuile: { zh: "南瓜子薄脆", en: "Pumpkin Seed Tuile" },
    cheesehotdog: { zh: "芝士熱狗包", en: "Cheese Hot Dog Bun" },
    pistachiohorn: { zh: "開心果奶油號角", en: "Pistachio Cream Horn" },
    radishcake: { zh: "蘿蔔糕", en: "Turnip Cake" },
    tarocake: { zh: "芋頭臘腸糕", en: "Taro & Sausage Cake" },
    ricecake: { zh: "椰汁黃糖年糕", en: "Coconut Brown Sugar Nian Gao" },
    chestnut: { zh: "栗子蛋糕", en: "Chestnut Cake" },
  };

  const DIGITS = {
    "0": ["111", "101", "101", "101", "111"],
    "1": ["010", "110", "010", "010", "111"],
    "2": ["111", "001", "111", "100", "111"],
    "3": ["111", "001", "011", "001", "111"],
    "4": ["101", "101", "111", "001", "001"],
    "5": ["111", "100", "111", "001", "111"],
    "6": ["111", "100", "111", "101", "111"],
    "7": ["111", "001", "010", "010", "010"],
    "8": ["111", "101", "111", "101", "111"],
    "9": ["111", "101", "111", "001", "111"],
    ".": ["000", "000", "000", "000", "010"],
    "-": ["000", "000", "111", "000", "000"],
  };

  const LETTERS = {
    "A": ["010", "101", "111", "101", "101"],
    "B": ["110", "101", "110", "101", "110"],
    "C": ["011", "100", "100", "100", "011"],
    "D": ["110", "101", "101", "101", "110"],
    "E": ["111", "100", "110", "100", "111"],
    "F": ["111", "100", "110", "100", "100"],
    "G": ["011", "100", "101", "101", "011"],
    "H": ["101", "101", "111", "101", "101"],
    "I": ["111", "010", "010", "010", "111"],
    "J": ["001", "001", "001", "101", "010"],
    "K": ["101", "101", "110", "101", "101"],
    "L": ["100", "100", "100", "100", "111"],
    "M": ["101", "111", "111", "101", "101"],
    "N": ["110", "101", "101", "101", "101"],
    "O": ["010", "101", "101", "101", "010"],
    "P": ["110", "101", "110", "100", "100"],
    "Q": ["010", "101", "101", "110", "011"],
    "R": ["110", "101", "110", "101", "101"],
    "S": ["011", "100", "010", "001", "110"],
    "T": ["111", "010", "010", "010", "010"],
    "U": ["101", "101", "101", "101", "111"],
    "V": ["101", "101", "101", "101", "010"],
    "W": ["101", "101", "111", "111", "101"],
    "X": ["101", "101", "010", "101", "101"],
    "Y": ["101", "101", "010", "010", "010"],
    "Z": ["111", "001", "010", "100", "111"],
    " ": ["000", "000", "000", "000", "000"],
  };

  function setupCanvas(canvas, cssWidth, cssHeight) {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    canvas.style.width = cssWidth + 'px';
    canvas.style.height = cssHeight + 'px';
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    return ctx;
  }

  /* Each drawing sits on a 12x12 grid but fills a different part of it — flat ones
   * (tuile, almond stick) use a few middle rows, round ones fill it. Centre by
   * measured content bounds so every slot in the tray lines up. */
  function offset(sprite) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let y = 0; y < sprite.rows.length; y += 1) {
      const row = sprite.rows[y];
      for (let x = 0; x < row.length; x += 1) {
        if (!sprite.palette[row[x]]) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (minX === Infinity) return { dx: 0, dy: 0 };
    return {
      dx: Math.round((sprite.rows[0].length - 1 - maxX - minX) / 2),
      dy: Math.round((sprite.rows.length - 1 - maxY - minY) / 2),
    };
  }

  /* bite: 0 = whole. Towards 1 it carves a growing circle out of the top-right. */
  function drawSprite(canvas, sprite, pixelSize, bite) {
    const width = sprite.rows[0].length * pixelSize;
    const height = sprite.rows.length * pixelSize;
    const ctx = setupCanvas(canvas, width, height);
    if (!ctx) return;
    const { dx, dy } = offset(sprite);
    for (let y = 0; y < sprite.rows.length; y += 1) {
      const row = sprite.rows[y];
      for (let x = 0; x < row.length; x += 1) {
        const color = sprite.palette[row[x]];
        if (!color) continue;
        ctx.fillStyle = color;
        ctx.fillRect((x + dx) * pixelSize, (y + dy) * pixelSize, pixelSize, pixelSize);
      }
    }
    if (bite > 0) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(width * 0.82, height * 0.2, bite * width * 0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  /* Draws a string cell by cell from DIGITS + LETTERS. Returns the CSS width. */
  function drawText(canvas, text, pixelSize, color, table) {
    const glyphs = table || Object.assign({}, DIGITS, LETTERS);
    const COLS = 3, GAP = 1;
    const cols = text.length * COLS + Math.max(0, text.length - 1) * GAP;
    const width = cols * pixelSize;
    const ctx = setupCanvas(canvas, width, 5 * pixelSize);
    if (!ctx) return width;
    ctx.fillStyle = color;
    let cursor = 0;
    for (const char of text) {
      const glyph = glyphs[char];
      if (glyph) {
        for (let y = 0; y < 5; y += 1) {
          for (let x = 0; x < COLS; x += 1) {
            if (glyph[y][x] === '1') ctx.fillRect((cursor + x) * pixelSize, y * pixelSize, pixelSize, pixelSize);
          }
        }
      }
      cursor += COLS + GAP;
    }
    return width;
  }

  const drawNumber = (canvas, text, pixelSize, color) => drawText(canvas, text, pixelSize, color, DIGITS);

  /* Each person's collection starts at a different point in the rotation, so the
   * same balance looks different on different phones. Variety, not uniqueness. */
  function forSlot(seed, index) {
    let sum = 0;
    for (let i = 0; i < seed.length; i += 1) sum += seed.charCodeAt(i);
    return CYCLE[(index + sum) % CYCLE.length];
  }

  return { SPRITES, CYCLE, LIMITED, NAMES, DIGITS, LETTERS, offset, drawSprite, drawText, drawNumber, forSlot };
})();

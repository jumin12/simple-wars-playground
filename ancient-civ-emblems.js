/**
 * Ancient civilization unit-counter emblems (Path2D-friendly SVG paths).
 * Rome/Gaul/Carthage use Path2D emblems below. SVG art assets live in skins/art/
 * (egypt1–2, macedon1–2, sparta1–2, rome1–10, gaul1–10).
 */
(function (global) {
    const WOD_ANCIENT_CIV_SVG = {
        civRome: {
            ox: 256,
            oy: 280,
            size: 512,
            paths: [
                'M256 108 C248 118 242 138 244 158 C246 178 252 192 256 202 C260 192 266 178 268 158 C270 138 264 118 256 108 Z',
                'M256 88 C270 82 286 90 292 104 C296 116 292 128 282 134 L276 138 L282 142 C294 150 298 164 292 176 C286 188 272 194 258 192 L252 191 L248 208 L264 208 L268 224 L244 224 L240 208 L220 208 L224 188 L236 182 C222 174 214 158 218 142 C222 126 236 114 252 110 Z',
                'M292 104 L318 98 L308 112 L296 114 Z',
                'M244 158 C210 150 168 132 142 148 C118 162 108 188 118 212 C128 236 158 248 188 242 C208 238 226 226 240 212 Z',
                'M268 158 C302 150 344 132 370 148 C394 162 404 188 394 212 C384 236 354 248 324 242 C304 238 286 226 272 212 Z',
                'M256 202 L248 248 L256 268 L264 248 Z'
            ],
            strokes: [
                'M256 268 L256 368',
                'M242 292 L270 292',
                'M238 318 L274 318',
                'M244 340 L268 340'
            ]
        },
        civCarthage: {
            ox: 256,
            oy: 268,
            size: 512,
            paths: [
                /* head (circle) */
                'M256 108 m-52 0 a52 52 0 1 0 104 0 a52 52 0 1 0 -104 0',
                /* body (triangle) */
                'M256 168 L168 408 L344 408 Z',
                /* arms */
                'M108 248 L404 248 L404 268 L108 268 Z',
                /* crescent above head */
                'M256 52 C220 52 192 76 192 108 C192 88 214 72 256 72 C298 72 320 88 320 108 C320 76 292 52 256 52 Z'
            ]
        },
        civGaul: {
            ox: 256,
            oy: 256,
            size: 512,
            /* Manx-style triskelion — three curved arms with rounded tips */
            arm: 'M256 256 C256 168 312 108 388 88 C420 80 438 108 424 142 C392 218 332 248 256 256 Z',
            ring: 'M256 256 m-168 0 a168 168 0 1 0 336 0 a168 168 0 1 0 -336 0',
            hub: 'M256 256 m-20 0 a20 20 0 1 0 40 0 a20 20 0 1 0 -40 0'
        }
    };

    if (typeof global !== 'undefined') {
        global.WOD_ANCIENT_CIV_SVG = WOD_ANCIENT_CIV_SVG;
    }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);

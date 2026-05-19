/**
 * Ancient civilization emblems — 1024px artboard, Path2D for counters & shop.
 * Carthage: Sign of Tanit (after Wikimedia Tanit-Symbol.svg, PD).
 * Gaul: Celtic triskelion. Rome: Legionary aquila (spread wings).
 */
(function (global) {
    const WOD_ANCIENT_CIV_SVG = {
        civRome: {
            ox: 512,
            oy: 500,
            size: 1024,
            emblemScale: 2.55,
            paths: [
                'M512 168 C476 188 452 236 458 288 C464 340 488 384 512 412 C536 384 560 340 566 288 C572 236 548 188 512 168 Z',
                'M512 120 C560 104 612 128 644 172 C668 208 664 260 636 296 L612 316 L632 336 C676 364 692 420 668 468 C644 516 592 540 540 532 L512 524 L488 576 L536 576 L556 632 L468 632 L448 576 L392 576 L412 520 L456 492 C408 464 380 408 392 348 C404 288 452 240 512 220 Z',
                'M644 172 L728 144 L692 200 L648 212 Z',
                'M458 288 C372 264 264 220 192 276 C128 324 100 404 136 492 C172 580 276 632 372 608 C440 592 492 548 524 496 Z',
                'M566 288 C652 264 760 220 832 276 C896 324 924 404 888 492 C852 580 748 632 652 608 C584 592 532 548 500 496 Z',
                'M512 412 L484 520 L512 580 L540 520 Z'
            ],
            strokes: [
                'M512 580 L512 760',
                'M456 660 L568 660',
                'M440 720 L584 720',
                'M448 760 L576 760'
            ]
        },
        civCarthage: {
            ox: 256,
            oy: 260,
            size: 512,
            emblemScale: 2.5,
            paths: [
                'M256 96 m-56 0 a56 56 0 1 0 112 0 a56 56 0 1 0 -112 0',
                'M256 160 L156 416 L356 416 Z',
                'M88 236 L424 236 L424 260 L88 260 Z',
                'M256 36 C212 36 176 68 176 104 C176 80 208 56 256 56 C304 56 336 80 336 104 C336 68 300 36 256 36 Z'
            ]
        },
        civGaul: {
            ox: 512,
            oy: 512,
            size: 1024,
            emblemScale: 2.55,
            arm: 'M512 512 C512 300 628 148 820 88 C920 60 968 148 928 268 C836 468 692 540 512 512 Z',
            ring: 'M512 512 m-352 0 a352 352 0 1 0 704 0 a352 352 0 1 0 -704 0',
            hub: 'M512 512 m-40 0 a40 40 0 1 0 80 0 a40 40 0 1 0 -80 0'
        }
    };

    if (typeof global !== 'undefined') {
        global.WOD_ANCIENT_CIV_SVG = WOD_ANCIENT_CIV_SVG;
    }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);

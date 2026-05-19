/**
 * High-resolution ancient civ emblems (1024 viewBox, Path2D-friendly).
 * Rome: legionary aquila. Carthage: Tanit (after Wikimedia Tanit-Symbol.svg, PD).
 * Gaul: Celtic triskelion.
 */
(function (global) {
    const WOD_ANCIENT_CIV_SVG = {
        civRome: {
            ox: 512,
            oy: 520,
            size: 1024,
            paths: [
                /* wings */
                'M512 340 C430 332 300 300 228 340 C168 374 148 430 178 488 C208 546 290 568 368 548 C418 536 468 508 498 472 Z',
                'M512 340 C594 332 724 300 796 340 C856 374 876 430 846 488 C816 546 734 568 656 548 C606 536 556 508 526 472 Z',
                /* body */
                'M512 340 C502 380 498 420 504 458 C508 478 510 492 512 502 C514 492 516 478 520 458 C526 420 522 380 512 340 Z',
                /* head */
                'M512 268 C548 258 586 278 598 312 C606 336 598 360 578 374 L568 382 L578 390 C598 404 606 432 592 456 C576 484 542 496 510 492 L498 490 L488 518 L536 518 L546 548 L478 548 L468 518 L428 518 L438 486 L462 474 C438 460 420 432 426 398 C432 364 462 338 496 328 Z',
                /* beak */
                'M598 312 L648 298 L628 328 L604 334 Z',
                /* tail feathers */
                'M512 502 L492 568 L512 612 L532 568 Z',
                /* shield on chest */
                'M512 400 C498 400 488 412 488 428 C488 448 498 462 512 468 C526 462 536 448 536 428 C536 412 526 400 512 400 Z'
            ],
            strokes: [
                'M512 612 L512 720',
                'M472 648 L552 648',
                'M458 688 L566 688',
                'M468 720 L556 720'
            ]
        },
        civCarthage: {
            ox: 512,
            oy: 500,
            size: 1024,
            paths: [
                /* head */
                'M512 200 m-100 0 a100 100 0 1 0 200 0 a100 100 0 1 0 -200 0',
                /* body */
                'M512 308 L312 820 L712 820 Z',
                /* arms */
                'M168 500 L856 500 L856 540 L168 540 Z',
                /* crescent */
                'M512 88 C448 88 392 132 392 200 C392 160 448 128 512 128 C576 128 632 160 632 200 C632 132 576 88 512 88 Z'
            ]
        },
        civGaul: {
            ox: 512,
            oy: 512,
            size: 1024,
            arm: 'M512 512 C512 340 620 220 780 168 C860 142 920 200 896 292 C828 468 700 548 512 512 Z',
            ring: 'M512 512 m-340 0 a340 340 0 1 0 680 0 a340 340 0 1 0 -680 0',
            hub: 'M512 512 m-36 0 a36 36 0 1 0 72 0 a36 36 0 1 0 -72 0'
        }
    };

    if (typeof global !== 'undefined') {
        global.WOD_ANCIENT_CIV_SVG = WOD_ANCIENT_CIV_SVG;
    }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);

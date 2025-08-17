import { SYMBOLS_CLASSIC } from '../../constants/symbols.constants';
import { resetAnimations } from '../../utils/animation.util';
import { SMSoundService } from '../../services/slot-machine/sound/slot-machine-sound.service';
import { SMVibrationService } from '../../services/slot-machine/vibration/slot-machine-vibration.service';
import { IS_FIREFOX } from '../../constants/browser.constants';
import { setGlobalClickAndTabHandler } from '../../utils/touch.util';

import { SlotMachineReel } from './reel/slot-machine-reel.component';

import './slot-machine.style.scss';

const fetchPlayResult = async (bets) => {
    const csrf = window.parent.document.querySelector('meta[name="csrf-token"]');
    const resp = await fetch(
        '/api/contest-slot-machine/',
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json;charset=UTF-8',
                Authorization: `Bearer ${ localStorage.getItem('token') }`,
                'X-CSRF-TOKEN': csrf ? csrf.getAttribute('content') : '',
            },
            body: JSON.stringify({
                contest_id: 2,
                bets,
            }),
        },
    );
    const data = await resp.json();

    return data;
};

const getUserInfo = async () => {
    const csrf = window.parent.document.querySelector('meta[name="csrf-token"]');
    const resp = await fetch(
        '/api/contest-user-info/?contest_id=2',
        {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json;charset=UTF-8',
                Authorization: `Bearer ${ localStorage.getItem('token') }`,
                'X-CSRF-TOKEN': csrf ? csrf.getAttribute('content') : '',
            },
        },
    );
    const data = await resp.json();

    return data;
};

function ordinalSuffixHanlde(i) {
    const j = i % 10;
    const k = i % 100;

    if (j === 1 && k !== 11) return `${ i }st`;
    if (j === 2 && k !== 12) return `${ i }nd`;
    if (j === 3 && k !== 13) return `${ i }rd`;

    return `${ i }th`;
}

function togglePlayButton(notAllow) {
    const target = document.querySelectorAll('.play-button');

    Array.from(target).forEach((item) => {
        if (notAllow) {
            item.classList.add('not-allowd');
        } else {
            item.classList.remove('not-allowd');
        }
    });
}

function dataInsert(data) {
    if (!data) {
        return;
    }

    const points = window.parent.document.querySelector('#contest_banner_points');
    const rank = window.parent.document.querySelector('#contest_banner_rank');
    const name = window.parent.document.querySelector('#contest_banner_name');
    const remaningSpin = window.parent.document.querySelector('#contest_banner_remaning_spin');
    const coins = window.parent.document.querySelector('#contest_banner_coins');
    const usedCoins = window.parent.document.querySelector('#contest_banner_coins_used');
    const contestBanner = window.parent.document.querySelector('.contest_banner');

    if (points) {
        points.innerHTML = data.points;
    }

    if (rank) {
        rank.innerHTML = ordinalSuffixHanlde(data.current_rank);
    }

    if (name) {
        name.innerHTML = data.name;
    }

    if (remaningSpin) {
        remaningSpin.innerHTML = data.available_play_chances;
    }

    if (coins) {
        coins.innerHTML = data.available_coins;
    }

    if (usedCoins) {
        usedCoins.innerHTML = data.used_coins;
    }

    if (contestBanner) {
        contestBanner.style.display = 'block';
    }
}

function changeUserInfo(amount) {
    const remaningSpin = window.parent.document.querySelector('#contest_banner_remaning_spin');
    const remainingNum = parseInt(remaningSpin.innerHTML, 10);

    if (!Number.isNaN(remainingNum)) {
        const newRemaining = remainingNum + amount;
        remaningSpin.innerHTML = newRemaining;
        setMaxBet(newRemaining);
    }
}

function generateIconSentence(matches, payout, callback) {
    let text = '';
    let title = '';
    let icon = '';

    if (Array.isArray(matches) && matches.length === 0) {
        text = 'No consecutive icons';
        title = 'Sorry!';
        icon = 'error';
    } else if (typeof matches === 'object' && !Array.isArray(matches)) {
        const items = [];

        Object.entries(matches).forEach(([key, count]) => {
            items.push(...Array(count).fill(key));
        });

        // Join with commas and add exclamation
        text = `${ items.join(' and ') } consecutive icons! Congratulations you earned ${ payout } coin(s)`;
        title = 'Congratulations!';
        icon = 'success';
    }

    window.parent.swalAlert?.({ text, title, icon, callback });
}

function setMaxBet(value) {
    const bet = document.querySelector('input[name="bet"]');
    bet.setAttribute('max', value);
}

export class SlotMachine {

    // CSS classes:
    static C_HAS_ZOOM = 'has-zoom';
    static C_IS_WIN = 'is-win';
    static C_IS_FAIL = 'is-fail';

    // CSS selectors:
    static S_BASE = '.sm__base';
    static S_REELS_CONTAINER = '.sm__reelsContainer';
    static S_DISPLAY = '.sm__display';

    // CSS variables:
    static V_WRAPPER_SIZE = '--wrapperSize';
    static V_REEL_SIZE = '--reelSize';
    static V_DISPLAY_SIZE = '--displaySize';
    static V_DISPLAY_ZOOM = '--displayZoom';
    static V_SHADOW_WEIGHT = '--shadowWeight';

    // Misc.:
    static UNITS_CENTER = 3;
    static UNITS_MARGIN = 1;
    static UNITS_TOTAL = SlotMachine.UNITS_CENTER + SlotMachine.UNITS_MARGIN;
    static ZOOM_TRANSITION = 'transform ease-in-out 500ms 250ms';
    static ZOOM_TRANSITION_DURATION = 1000;
    static BLIP_RATE = 4;
    static FIREFOX_SHADOW_WEIGHT = 0.5;
    static APP_PADDING = 32;

    // Elements:
    wrapper;
    root = document.querySelector(SlotMachine.S_BASE);
    reelsContainer = document.querySelector(SlotMachine.S_REELS_CONTAINER);
    display = document.querySelector(SlotMachine.S_DISPLAY);
    reels = [];
    getCoins;

    // Config:
    blipFading;
    reelCount;
    symbols;
    alpha;
    speed;

    // State:
    zoomTransitionTimeoutID = null;
    currentCombination = [];
    currentReel = null;
    blipCounter = 0;
    lastUpdate = 0;
    isPaused = false;
    keydownTimeoutID = null;
    keydownLastCalled = 0;
    coinMap = {
        0: 1,
        2: 5,
        3: 15,
        4: 50,
        5: 100,
    };

    chances = 0;
    outcome = [];
    matches = [];
    payout = 0;

    constructor(
        wrapper,
        handleUseCoin,
        handleGetPrice,
        reelCount = 3,
        symbols = SYMBOLS_CLASSIC,
        isPaused = false,
        speed = -0.552, // TODO: Make enum and match sounds too.
        getCoins = null,
    ) {
        this.init(wrapper, handleUseCoin, handleGetPrice, reelCount, symbols, speed, getCoins);

        window.onresize = this.handleResize.bind(this);
        document.onkeydown = this.handleKeyDown.bind(this);
        document.onkeyup = this.handleKeyUp.bind(this);
        this.handleClick = this.handleClick.bind(this);

        if (isPaused) {
            this.pause();
        } else {
            this.resume();
        }
    }

    async init(
        wrapper,
        handleUseCoin,
        handleGetPrice,
        reelCount,
        symbols,
        speed,
        getCoins,
    ) {
        this.wrapper = wrapper;
        this.handleUseCoin = handleUseCoin;
        this.handleGetPrice = handleGetPrice;
        this.reelCount = reelCount;
        this.symbols = symbols;
        this.speed = speed;
        this.blipFading = 1 / reelCount;
        this.getCoins = getCoins;

        const alpha = this.alpha = 360 / symbols.length;
        const shuffledSymbols = [...symbols];
        const diameter = (2 * reelCount) + SlotMachine.UNITS_CENTER;

        // Sets --reelSize and --displaySize:
        this.resize();

        if (IS_FIREFOX) {
            this.root.style.setProperty(SlotMachine.V_SHADOW_WEIGHT, SlotMachine.FIREFOX_SHADOW_WEIGHT);
        }

        const { reelsContainer, reels } = this;

        for (let reelIndex = 0; reelIndex < reelCount; ++reelIndex) {
            const reel = new SlotMachineReel(reelIndex, alpha, shuffledSymbols, diameter);

            reelsContainer.appendChild(reel.root);
            reels.push(reel);
        }

        // Additional reel at the end that acts as a "cover" in case we set a background color on them and we only want
        // to see a ring even in the inner-most one, instead of a filled circle:
        reelsContainer.appendChild(new SlotMachineReel(reelCount).root);

        // document.querySelector('input[name="bet"]').addEventListener('input', (e) => {
        //     const betAmount = parseInt(e.target?.value ?? 0, 10);

        //     if (betAmount > this.chances) {
        //         togglePlayButton(true);
        //     } else {
        //         togglePlayButton(false);
        //     }
        // });

        const userInfo = await getUserInfo();
        const validStart = (userInfo?.available_play_chances ?? 0) > 0;
        togglePlayButton(!validStart);
        dataInsert(userInfo);
        setMaxBet(userInfo?.available_play_chances ?? 0);
        this.chances = userInfo?.available_play_chances ?? 0;
    }

    start() {
        const bet = document.querySelector('input[name="bet"]');
        const betAmount = parseInt(bet?.value ?? 0, 10);

        this.handleUseCoin(betAmount);
        this.currentCombination = [];
        this.currentReel = 0;
        this.zoomOut();
        this.display.classList.remove(SlotMachine.C_IS_WIN, SlotMachine.C_IS_FAIL);
        this.reels.forEach((reel) => reel.reset());
        resetAnimations();

        SMSoundService.coin();
        SMVibrationService.start();

        this.lastUpdate = performance.now();
        requestAnimationFrame(() => this.tick());

        bet.disabled = true;
    }

    stop() {
        const currentPrize = this.checkPrize();
        const bet = document.querySelector('input[name="bet"]');

        bet.disabled = false;

        this.currentReel = null;

        if (currentPrize) {
            SMSoundService.win();

            this.display.classList.add(SlotMachine.C_IS_WIN);
            this.zoomIn();

            this.handleGetPrice(currentPrize);
        } else {
            SMSoundService.unlucky();

            this.display.classList.add(SlotMachine.C_IS_FAIL);
            this.zoomIn();
        }
    }

    tick() {
        const { reels, speed, currentReel, lastUpdate } = this;
        const now = performance.now();
        const deltaTime = now - lastUpdate;
        const deltaAlpha = deltaTime * speed;

        if (currentReel === null || this.isPaused) {
            return;
        }

        const blipCounter = this.blipCounter = (this.blipCounter + 1) % SlotMachine.BLIP_RATE;

        if (blipCounter === 0) SMSoundService.blip(1 - (this.blipFading * currentReel));

        this.lastUpdate = now;

        for (let i = reels.length - 1; i >= currentReel; --i) {
            const reel = reels[i];
            const angle = reel.angle = (360 + (reel.angle + deltaAlpha)) % 360;

            reel.style.transform = `rotate(${ angle }deg)`;
        }

        requestAnimationFrame(() => this.tick());
    }

    zoomIn() {
        this.zoom();
    }

    zoomOut() {
        this.zoom(true);
    }

    zoom(out = false) {
        clearTimeout(this.zoomTransitionTimeoutID);

        const { root } = this;

        root.style.transition = SlotMachine.ZOOM_TRANSITION;
        root.classList[out ? 'remove' : 'add'](SlotMachine.C_HAS_ZOOM);

        // We do this as transition end will bubble up and fire a lot of times, not only for this transition:
        this.zoomTransitionTimeoutID = setTimeout(() => {
            root.style.transition = '';
        }, SlotMachine.ZOOM_TRANSITION_DURATION);
    }

    resize() {
        const { wrapper, root, reelCount, display } = this;
        const { style } = root;
        const { offsetWidth, offsetHeight } = wrapper;
        const wrapperSize = Math.min(offsetWidth, offsetHeight) - SlotMachine.APP_PADDING;
        const reelSize = wrapperSize / ((2 * reelCount) + SlotMachine.UNITS_TOTAL) | 0;

        if (wrapperSize <= 0 || reelSize <= 0 || root.offsetWidth / display.offsetWidth <= 0) {
            requestAnimationFrame(() => this.resize());

            return;
        }

        style.setProperty(SlotMachine.V_WRAPPER_SIZE, `${ wrapperSize }px`);
        style.setProperty(SlotMachine.V_REEL_SIZE, `${ reelSize }px`);
        style.setProperty(SlotMachine.V_DISPLAY_SIZE, `${ reelSize * reelCount }px`);
        style.setProperty(SlotMachine.V_DISPLAY_ZOOM, `${ root.offsetWidth / display.offsetWidth }`);
    }

    stopReel(reelIndex, outcome) {
        const { speed } = this;
        const deltaAlpha = (performance.now() - this.lastUpdate) * speed;

        this.currentCombination.push(this.reels[reelIndex].stop(speed, deltaAlpha, outcome));

        SMSoundService.stop();
        SMVibrationService.stop();
    }

    checkPrize() {
        const { currentCombination, reelCount, symbols } = this;
        const occurrencesCount = {};
        const bet = document.querySelector('input[name="bet"]');
        const betAmount = parseInt(bet?.value ?? 0, 10);

        let maxOccurrences = 0;
        let lastSymbol = '';
        let maxSymbol = '';
        let maxPrize = 0;

        for (let i = 0; i < reelCount; ++i) {
            const symbol = currentCombination[i];
            const occurrences = occurrencesCount[symbol] = lastSymbol === symbol ? occurrencesCount[symbol] + 1 : 1;

            lastSymbol = symbol;

            if (occurrences > maxOccurrences) {
                maxOccurrences = occurrences;

                const index = symbols.indexOf(symbol);
                const maxIndex = symbols.indexOf(maxSymbol); // TODO: Calculate every time?

                if (index > maxIndex) {
                    maxSymbol = symbol;
                    maxPrize = index + 1;
                }
            }
        }

        const coins = this.coinMap[maxOccurrences];

        return betAmount * coins;
    }

    handleResize() {
        requestAnimationFrame(() => this.resize());
    }

    handleKeyDown(e) {
        window.clearTimeout(this.keydownTimeoutID);

        const { key } = e;

        // TODO: This should not be here:
        // if (key === 'Esc') {
        //     document.activeElement.blur();

        //     return;
        // }

        if (this.isPaused || document.activeElement !== document || ![' ', 'Enter'].includes(key)) return;

        const elapsed = Date.now() - this.keydownLastCalled;

        if (elapsed >= 1000) {
            this.handleClick();
        } else {
            this.keydownTimeoutID = window.setTimeout(this.handleClick.bind(this), 1000 - elapsed);
        }
    }

    handleKeyUp(e) {
        if (![' ', 'Enter'].includes(e.key)) return;

        window.clearTimeout(this.keydownTimeoutID);

        this.keydownLastCalled = 0;
    }

    async handleClick(e = null) {
        window.clearTimeout(this.keydownTimeoutID);

        this.keydownLastCalled = Date.now();

        // Keyboard events (above) will call this without passing down `e`:

        if (!e) {
            return;
        }

        this.zoomOut();

        const { target } = e;
        const targetTagName = target.tagName;
        const parentTagName = target.parentElement.tagName;
        const playButtonText = document.querySelector('.play-button > div');

        if (!target?.classList.contains('play-button')) {
            return;
        }

        if (/^A|BUTTON$/.test(targetTagName) || /^A|BUTTON$/.test(parentTagName)) {
            // TODO: This is only needed for links.

            document.activeElement.blur();

            return;
        }

        // TODO: Should be e.button instead?
        if (e.which === 3) return;

        const coins = this.getCoins();
        const bet = document.querySelector('input[name="bet"]');
        const betAmount = parseInt(bet?.value ?? 0, 10);
        const validStart = (this.chances ?? 0) > 0 && this.chances >= betAmount;
        const { currentReel } = this;

        if (currentReel === null && validStart) {
            const data = await fetchPlayResult(betAmount);
            this.outcome = data?.outcome ?? [];
            this.matches = data?.matches ?? [];
            this.payout = data?.payout ?? 0;
            playButtonText.innerHTML = 'STOP';
            this.start();
            changeUserInfo(-betAmount);
        } else if (currentReel !== null) {
            ++this.currentReel;

            this.stopReel(currentReel, this.outcome[currentReel]);

            if (currentReel === this.reels.length - 1) {
                const information = await getUserInfo();
                const valid = (information?.available_play_chances ?? 0) > 0;
                dataInsert(information);
                togglePlayButton(!valid);
                setMaxBet(information?.available_play_chances ?? 0);
                this.chances = information?.available_play_chances ?? 0;
                playButtonText.innerHTML = 'SPIN';
                this.stop();
                generateIconSentence(this.matches, this.payout, () => { this.zoomOut(); });
            }
        }
    }

    pause() {
        setGlobalClickAndTabHandler(null);

        this.isPaused = true;
    }

    resume() {
        setGlobalClickAndTabHandler(this.handleClick);

        this.isPaused = false;

        if (this.currentReel !== null) requestAnimationFrame(() => this.tick());
    }

}

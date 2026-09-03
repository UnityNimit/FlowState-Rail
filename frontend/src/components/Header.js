// Header.js
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import './Header.css';



import ShinyText from './ShinyText';

// Import GSAP and ScrollToPlugin
import { gsap } from 'gsap';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';
gsap.registerPlugin(ScrollToPlugin);


const legendaryStepsFactory = () => [
    { id: 'intro', title: 'Welcome', selector: null, content: 'Welcome to the Railway Section Controller. This guided tour will explain every part of the interface.' },
    { id: 'left-sidebar', title: 'Left Sidebar', selector: '.left-sidebar', content: 'This is the main control sidebar. It contains panels for station selection, AI strategy, and managing track blockages.' },
    { id: 'station-selector', title: 'Station Selector', selector: '.left-sidebar .panel:nth-of-type(1)', content: 'Use this panel to select the railway network you want to control. You can only change the station when the simulation is stopped.' },
    { id: 'ai-strategy', title: 'AI Optimization', selector: '.left-sidebar .panel:nth-of-type(2)', content: 'Configure the AI\'s decision-making process by toggling different priorities.' },
    { id: 'blocked-tracks', title: 'Blocked Tracks', selector: '.left-sidebar .panel:nth-of-type(3)', content: 'Manually block a track segment if there is a fault.' },
    { id: 'track', title: 'Track Diagram', selector: '#panel-1', content: 'This is the Track Diagram — it shows all track segments, signals, and trains in real time.' },
    { id: 'chat', title: 'Operator Chatbot', selector: '#panel-chat', content: 'Ask the chatbot questions about the network status or AI decisions.' },
    { id: 'right-sidebar', title: 'Right Sidebar', selector: '.right-sidebar', content: 'This sidebar provides a live feed of the simulation status and the AI\'s decisions.' },
    { id: 'decision-panel', title: 'Decision Panel', selector: '.right-sidebar .main-panel', content: 'Shows what the AI is doing and why.' },
    { id: 'status-pills', title: 'Live Status', selector: '.right-sidebar .status-row', content: 'These pills show the current state of the simulation.' },
    { id: 'ai-card-example', title: 'AI Decision Card', selector: '.ai-card', content: 'Each card represents a decision for a specific train.' },
    { id: 'sim-controls', title: 'Simulation Controls', selector: '.right-sidebar .panel-footer', content: 'Controls for the simulation itself.' },
    { id: 'sim-speed', title: 'Simulation Speed', selector: '.speed-control-group', content: 'Adjust the speed of the simulation.' },
    { id: 'sim-actions', title: 'Simulation Actions', selector: '.control-btns', content: 'Use these buttons to Start, Pause, Resume, or Stop the simulation.' },
    { id: 'end', title: 'Tour Complete', selector: null, content: 'You have completed the guided tour. You can re-run this tutorial any time by clicking the Tutorial button in the header.' }
];

const Header = () => {
    const [running, setRunning] = useState(false);
    const [steps, setSteps] = useState(legendaryStepsFactory());
    const [index, setIndex] = useState(0);
    const [highlightStyle, setHighlightStyle] = useState(null);
    const [tooltipStyle, setTooltipStyle] = useState(null);

    const overlayRef = useRef(null);
    const firstButtonRef = useRef(null);
    const scrollTimerRef = useRef(null);

    // Keep refs so event handlers attached to the DOM can read up-to-date values
    const indexRef = useRef(index);
    const stepsRef = useRef(steps);

    useEffect(() => { indexRef.current = index; }, [index]);
    useEffect(() => { stepsRef.current = steps; }, [steps]);

    const applyComputedStyles = useCallback((targetEl) => {
        if (!targetEl) return;
        const rect = targetEl.getBoundingClientRect();
        const padding = 10;

        setHighlightStyle({
            top: `${rect.top - padding}px`,
            left: `${rect.left - padding}px`,
            width: `${rect.width + padding * 2}px`,
            height: `${rect.height + padding * 2}px`,
            opacity: 1,
        });

        const tooltipWidth = 380;
        const margin = 16;
        const vh = window.innerHeight;
        const vw = window.innerWidth;
        let tooltipLeft, tooltipTop;

        if (rect.height > vh * 0.7) {
            tooltipTop = rect.top + margin;
            tooltipLeft = rect.left < vw / 2 ? rect.right + margin : rect.left - tooltipWidth - margin;
        } else {
            tooltipLeft = rect.left + (rect.width / 2) - (tooltipWidth / 2);
            tooltipTop = rect.top > vh / 2 ? rect.top - margin : rect.bottom + margin;
        }

        if (tooltipLeft < margin) tooltipLeft = margin;
        if (tooltipLeft + tooltipWidth > vw - margin) tooltipLeft = vw - tooltipWidth - margin;

        setTooltipStyle({
            left: `${tooltipLeft}px`,
            top: `${tooltipTop}px`,
            transformOrigin: (rect.top > vh / 2 && rect.height <= vh * 0.7) ? 'bottom center' : 'top center',
            transform: (rect.top > vh / 2 && rect.height <= vh * 0.7) ? 'translateY(-100%)' : 'none',
            opacity: 1
        });
    }, []);

    const applyStep = useCallback((i, providedSteps) => {
        // Clear any pending scroll timer
        if (scrollTimerRef.current) {
            clearTimeout(scrollTimerRef.current);
            scrollTimerRef.current = null;
        }

        const list = providedSteps || stepsRef.current;
        if (!list || i < 0 || i >= list.length) {
            setHighlightStyle(null);
            setTooltipStyle(null);
            return;
        }

        const step = list[i];
        const targetEl = step.selector ? document.querySelector(step.selector) : null;

        if (!targetEl) {
            // Center tooltip if there's no target
            setHighlightStyle({ display: 'none' });
            setTooltipStyle({
                top: '50%', left: '50%',
                transform: 'translate(-50%, -50%)',
                maxWidth: '420px',
                opacity: 1
            });
            return;
        }

        const rect = targetEl.getBoundingClientRect();
        const fullyVisible = rect.top >= 0 && rect.bottom <= window.innerHeight && rect.left >= 0 && rect.right <= window.innerWidth;

        if (!fullyVisible) {
            try {
                targetEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
            } catch (e) {
                targetEl.scrollIntoView();
            }
            // show hidden placeholder until scroll finishes
            setHighlightStyle({ opacity: 0 });
            setTooltipStyle({ opacity: 0 });

            scrollTimerRef.current = setTimeout(() => {
                applyComputedStyles(targetEl);
                scrollTimerRef.current = null;
            }, 350);
            return;
        }

        applyComputedStyles(targetEl);
    }, [applyComputedStyles]);

    const onWindowChange = useCallback(() => {
        if (running) applyStep(indexRef.current);
    }, [running, applyStep]);

    const closeTutorial = useCallback(() => {
        document.documentElement.classList.remove('tutorial-active');
        setRunning(false);
        setIndex(0);
        setHighlightStyle(null);
        setTooltipStyle(null);

        if (scrollTimerRef.current) {
            clearTimeout(scrollTimerRef.current);
            scrollTimerRef.current = null;
        }

        window.removeEventListener('resize', onWindowChange);
        window.removeEventListener('scroll', onWindowChange, true);
    }, [onWindowChange]);

    const goNext = useCallback(() => {
        setIndex(prev => {
            const nextIndex = prev + 1;
            if (nextIndex >= stepsRef.current.length) {
                closeTutorial();
                return prev;
            }
            return nextIndex;
        });
    }, [closeTutorial]);

    const goPrev = useCallback(() => {
        setIndex(prev => Math.max(prev - 1, 0));
    }, []);

    // Attach global listeners + overlay wheel/touch/click forwarding when tutorial runs
    useEffect(() => {
        if (!running) {
            // cleanup if needed
            window.removeEventListener('resize', onWindowChange);
            window.removeEventListener('scroll', onWindowChange, true);
            return;
        }

        window.addEventListener('resize', onWindowChange);
        window.addEventListener('scroll', onWindowChange, true);

        const overlay = overlayRef.current;
        if (!overlay) return;

        // detect scroll container (prefer your main-body)
        const scrollContainer = document.querySelector('.control-room-layout .main-body') || document.scrollingElement || document.documentElement;

        // click on overlay background -> advance (only if click target is the overlay itself;
        // the dim is pointer-events:none so clicks on the visible dim still target the overlay)
        const onOverlayClick = (e) => {
            if (e.target === overlay) {
                // use the "up-to-date" index via ref
                if (indexRef.current === (stepsRef.current.length - 1)) {
                    closeTutorial();
                } else {
                    goNext();
                }
            }
        };

        // wheel forwarding: forward mouse-wheel deltas to the page's scroll container
        const onWheel = (e) => {
            // do not forward when interacting with the tooltip itself
            if (e.target.closest && (e.target.closest('.tutorial-tooltip') || e.target.closest('.tutorial-highlight'))) {
                return;
            }
            if (!scrollContainer) return;
            // forward
            scrollContainer.scrollBy({ top: e.deltaY, left: e.deltaX, behavior: 'auto' });
            // prevent default so the overlay doesn't try to do anything itself
            e.preventDefault();
        };

        // touch forwarding for mobile: emulate scrolling by tracking touch movement
        let tStartY = null;
        let tStartX = null;
        const onTouchStart = (e) => {
            if (!e.touches || e.touches.length !== 1) return;
            tStartY = e.touches[0].clientY;
            tStartX = e.touches[0].clientX;
        };
        const onTouchMove = (e) => {
            if (tStartY === null || !e.touches || e.touches.length !== 1) return;
            // ignore moves that originate on tooltip/highlight
            if (e.target.closest && (e.target.closest('.tutorial-tooltip') || e.target.closest('.tutorial-highlight'))) {
                return;
            }
            const curY = e.touches[0].clientY;
            const curX = e.touches[0].clientX;
            const dy = tStartY - curY;
            const dx = tStartX - curX;
            if (scrollContainer) {
                scrollContainer.scrollBy({ top: dy, left: dx, behavior: 'auto' });
            }
            // update start for next move
            tStartY = curY;
            tStartX = curX;
            // Prevent the default native behavior (the overlay otherwise blocks propagation)
            e.preventDefault();
        };
        const onTouchEnd = () => { tStartY = tStartX = null; };

        // attach
        overlay.addEventListener('click', onOverlayClick);
        overlay.addEventListener('wheel', onWheel, { passive: false });
        overlay.addEventListener('touchstart', onTouchStart, { passive: true });
        overlay.addEventListener('touchmove', onTouchMove, { passive: false });
        overlay.addEventListener('touchend', onTouchEnd, { passive: true });

        // keyboard controls
        const keyHandler = (e) => {
            if (e.key === 'Escape') { e.preventDefault(); closeTutorial(); }
            else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); goNext(); }
            else if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev(); }
        };
        window.addEventListener('keydown', keyHandler);

        // cleanup
        return () => {
            overlay.removeEventListener('click', onOverlayClick);
            overlay.removeEventListener('wheel', onWheel, { passive: false });
            overlay.removeEventListener('touchstart', onTouchStart, { passive: true });
            overlay.removeEventListener('touchmove', onTouchMove, { passive: false });
            overlay.removeEventListener('touchend', onTouchEnd, { passive: true });

            window.removeEventListener('resize', onWindowChange);
            window.removeEventListener('scroll', onWindowChange, true);
            window.removeEventListener('keydown', keyHandler);
        };
    }, [running, onWindowChange, goNext, goPrev, closeTutorial]);

    // apply step whenever index changes
    useEffect(() => {
        if (running) {
            applyStep(index);
            // focus first button for accessible keyboard interaction
            const focusTimer = setTimeout(() => firstButtonRef.current?.focus(), 150);
            return () => clearTimeout(focusTimer);
        }
    }, [index, running, applyStep]);

    const startTutorial = async () => {
        document.documentElement.classList.add('tutorial-active');

        const dynamicToolbarSteps = [];
        try {
            const toolbar = document.querySelector('.toolbar-floating');
            if (toolbar) {
                dynamicToolbarSteps.push({
                    id: 'toolbar-area',
                    title: 'Toolbar',
                    selector: '.toolbar-floating',
                    content: 'This toolbar provides quick controls for the track diagram.'
                });
            }
        } catch (e) {
            console.warn('Tutorial: dynamic toolbar build failed', e);
        }

        const baseSteps = legendaryStepsFactory();
        const trackIndex = baseSteps.findIndex(step => step.id === 'track');
        const fullSteps = [
            ...baseSteps.slice(0, trackIndex + 1),
            ...dynamicToolbarSteps,
            ...baseSteps.slice(trackIndex + 1)
        ];
        setSteps(fullSteps);

        setTimeout(() => {
            setRunning(true);
            setIndex(0);
            applyStep(0, fullSteps);
        }, 80);
    };

    const renderTooltip = () => {
        if (!running || !steps[index]) return null;
        const step = steps[index];
        const isLastStep = index + 1 >= steps.length;

        return (
            <div className="tutorial-tooltip" style={tooltipStyle} role="dialog" aria-modal="true">
                <div className="tutorial-header">
                    <strong>{step.title || `Step ${index + 1}`}</strong>
                    <span className="tutorial-stepcount">{index + 1}/{steps.length}</span>
                </div>
                <div className="tutorial-body">
                    <div dangerouslySetInnerHTML={{ __html: (step.content || '') }} />
                </div>
                <div className="tutorial-footer">
                    <button ref={firstButtonRef} className="tutorial-btn secondary" onClick={goPrev} disabled={index <= 0}>Prev</button>
                    <button className="tutorial-btn secondary" onClick={closeTutorial}>Close</button>
                    <button className="tutorial-btn primary" onClick={goNext}>
                        {isLastStep ? 'Finish' : 'Next'}
                    </button>
                </div>
            </div>
        );
    };

    return (
        <>
            <header className="app-header">
                <div className="header-left">
                    <Link to="/" className="header-brand-link" title="Return to Flow Home">
                        <img
                            src={process.env.PUBLIC_URL + '/logo.png'}
                            alt="Flow"
                            className="header-brand-logo"
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                        <span className="header-brand-text">Flow</span>
                    </Link>
                    <button className="tutorial-launch" title="Run guided tutorial" onClick={startTutorial}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.4"/>
                        </svg>
                        <span>Tutorial</span>
                    </button>
                </div>
                {/* CODED BY NIMIT */}
                <div style={{ fontWeight: 'bold', fontSize: '24px' }}>
                    <ShinyText
                    text="Railway Section Controller"
                    speed={2}
                    pause={false}
                    />
                </div>
                <div className="header-right">
                    <div className="brand-sub">Flow · Dispatch Console</div>
                </div>
            </header>

            {running && (
                <div
                    className="tutorial-overlay"
                    ref={overlayRef}
                >
                    <div className="tutorial-dim" />
                    <div className="tutorial-highlight" style={highlightStyle || { display: 'none' }} aria-hidden="true" />
                    {renderTooltip()}
                </div>
            )}
        </>
    );
};

export default Header;

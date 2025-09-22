
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Hyperspeed from '../components/Hyperspeed';
import './HomePage.css';
import { Zap, ShieldCheck, Clock, BrainCircuit, BarChart, Settings, Database, Bot } from 'lucide-react';
import Shuffle from '../components/Shuffle';
import ShinyText from '../components/ShinyText';

// Import GSAP and ScrollToPlugin
import { gsap } from 'gsap';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';
gsap.registerPlugin(ScrollToPlugin);

// Preset for the Hyperspeed background effect
const hyperspeedPreset = {
    distortion: 'turbulentDistortion',
    length: 400,
    roadWidth: 10,
    islandWidth: 2,
    lanesPerRoad: 4,
    fov: 90,
    fovSpeedUp: 150,
    speedUp: 2,
    carLightsFade: 0.4,
    totalSideLightSticks: 20,
    lightPairsPerRoadWay: 40,
    shoulderLinesWidthPercentage: 0.05,
    brokenLinesWidthPercentage: 0.1,
    brokenLinesLengthPercentage: 0.5,
    lightStickWidth: [0.12, 0.5],
    lightStickHeight: [1.3, 1.7],
    movingAwaySpeed: [60, 80],
    movingCloserSpeed: [-120, -160],
    carLightsLength: [400 * 0.03, 400 * 0.2],
    carLightsRadius: [0.05, 0.14],
    carWidthPercentage: [0.3, 0.5],
    carShiftX: [-0.8, 0.8],
    carFloorSeparation: [0, 5],
    colors: {
      roadColor: 0x080808,
      islandColor: 0x0a0a0a,
      background: 0x000000,
      shoulderLines: 0x131318,
      brokenLines: 0x131318,
      // Adjusted colors for better aesthetic and contrast
      leftCars: [0xE060E6, 0x8C4EC1, 0xD856BF], // More vibrant purples
      rightCars: [0x00C6FF, 0x0A72B3, 0x324555], // More vibrant blues
      sticks: 0x00C6FF, // Matching the new blue accent
    }
};

const HomePage = () => {
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false);
  const sectionElementsRef = useRef([]); // To store references to all scrollable sections

  // Refs to hold the latest state values for event handlers
  const currentSectionIndexRef = useRef(currentSectionIndex);
  const isScrollingRef = useRef(isScrolling);

  // Update refs when state changes
  useEffect(() => {
    currentSectionIndexRef.current = currentSectionIndex;
  }, [currentSectionIndex]);

  useEffect(() => {
    isScrollingRef.current = isScrolling;
  }, [isScrolling]);


  const scrollToSection = useCallback((index) => {
    // Use refs for the latest values
    if (isScrollingRef.current || index < 0 || index >= sectionElementsRef.current.length) {
      return;
    }

    setIsScrolling(true); // Set state immediately
    const targetSection = sectionElementsRef.current[index];
    const targetScrollTop = targetSection.offsetTop;

    gsap.to(window, {
      scrollTo: {
        y: targetScrollTop,
        autoKill: false
      },
      duration: 0.8,
      ease: "power2.inOut",
      onComplete: () => {
        setCurrentSectionIndex(index); // Update index state on completion
        setIsScrolling(false); // Reset scrolling state
      }
    });
  }, []); // Empty dependency array as it uses refs and state setters

  // Effect for initial setup and IntersectionObserver
  useEffect(() => {
    // Get all scrollable sections and store their DOM references
    sectionElementsRef.current = Array.from(document.querySelectorAll('.scrollable-content > section'));

    // Initialize IntersectionObserver for fade-in animations
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
        } else {
            // Optional: remove 'visible' class when out of view
            // entry.target.classList.remove('visible');
        }
      });
    }, {
      threshold: 0.2
    });

    sectionElementsRef.current.forEach(section => observer.observe(section));

    // Cleanup IntersectionObserver
    return () => {
      sectionElementsRef.current.forEach(section => observer.unobserve(section));
    };
  }, []); // Runs once on mount

  // Effect for attaching/detaching the wheel event listener
  useEffect(() => {
    let scrollTimeout; // For debouncing scroll events
    const handleWheel = (event) => {
      // Use refs for the latest values
      if (isScrollingRef.current) {
        event.preventDefault(); // Always prevent default if scrolling is active
        return;
      }

      event.preventDefault(); // ALWAYS prevent default if we're handling the scroll

      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        const direction = event.deltaY > 0 ? 1 : -1;
        let nextIndex = currentSectionIndexRef.current + direction; // Use ref here

        nextIndex = Math.max(0, Math.min(sectionElementsRef.current.length - 1, nextIndex));

        if (nextIndex !== currentSectionIndexRef.current) { // Use ref here
          scrollToSection(nextIndex);
        }
      }, 100); // Debounce time

    };

    // Attach the wheel event listener to the window
    window.addEventListener('wheel', handleWheel, { passive: false });

    // Initial scroll to the very top of the first section, only on mount
    if (sectionElementsRef.current.length > 0) {
      gsap.set(window, { scrollTo: { y: sectionElementsRef.current[0].offsetTop }});
      setCurrentSectionIndex(0); // Ensure state reflects initial position
    }

    // Cleanup function: Remove event listeners and clear timeout
    return () => {
      window.removeEventListener('wheel', handleWheel);
      clearTimeout(scrollTimeout);
    };
  }, [scrollToSection]); // Re-run if scrollToSection changes (it's memoized, so shouldn't often)


  return (
    <div className="home-page">
      <div className="background-container">
        <Hyperspeed effectOptions={hyperspeedPreset} />
      </div>

      <main className="scrollable-content">
        {/* Section 1: Hero */}
        <section className="hero-section">
          <div className="hero-content">
            <Shuffle
                text="FlowState Rail"
                className="hero-title"
                shuffleDirection="right"
                duration={0.7}
                animationMode="evenodd"
                shuffleTimes={1}
                ease="power3.out"
                stagger={0.05}
                threshold={0.1}
                loop={true}
                loopDelay={2}
                triggerOnce={true}
                triggerOnHover={true}
                respectReducedMotion={true}
            />
            <ShinyText
              text="Intelligent Decision Support for the Future of Indian Railways"
              className="hero-subtitle"
              speed={5}
            />
          </div>
          <Link to="/dashboard" className="hero-button">
            <ShinyText
              text="Enter Control Room"
              className="button-text"
              speed={3}
            />
          </Link>
          <div className="scroll-indicator">
            <span>Scroll Down</span>
          </div>
        </section>

        {/* Section 2: The Problem */}
        <section className="content-section">
          <h2 className="section-title">The Challenge Facing Indian Railways</h2>
          <p className="section-intro">
            As one of the world's largest railway networks, Indian Railways faces unprecedented complexity. Growing congestion and the need for higher efficiency demand a shift from traditional manual control to intelligent, data-driven systems.
          </p>
          <div className="problem-cards">
            <div className="card">
              <Clock className="card-icon" size={48} />
              <h3>Network Congestion</h3>
              <p>Trains of varying priorities—express, local, freight—compete for limited track space, leading to delays and suboptimal routing.</p>
            </div>
            <div className="card">
              <BrainCircuit className="card-icon" size={48} />
              <h3>Complex Decisions</h3>
              <p>Controllers make real-time decisions based on experience, but the sheer volume of variables makes optimal choices difficult, especially during disruptions.</p>
            </div>
            <div className="card">
              <Zap className="card-icon" size={48} />
              <h3>Real-time Disruptions</h3>
              <p>Incidents like breakdowns, weather, and unforeseen delays create cascading failures that are challenging to manage manually.</p>
            </div>
          </div>
        </section>

        {/* Section 3: The Solution */}
        <section className="content-section solution-section">
           <h2 className="section-title">Our Solution: The FlowState Engine</h2>
           <p className="section-intro">
            FlowState Rail is an intelligent decision-support system designed to empower traffic controllers. By leveraging AI and Operations Research, we transform complex, real-time data into clear, optimized, and actionable routing strategies.
           </p>
           <div className="feature-grid">
                <div className="feature-item">
                    <BarChart size={32} />
                    <span>Maximize Throughput & Minimize Delays</span>
                </div>
                <div className="feature-item">
                    <ShieldCheck size={32} />
                    <span>Generate Conflict-Free Schedules</span>
                </div>
                 <div className="feature-item">
                    <Settings size={32} />
                    <span>Run What-If Simulations</span>
                </div>
                 <div className="feature-item">
                    <Database size={32} />
                    <span>Integrate with Existing Systems</span>
                </div>
                 <div className="feature-item">
                    <Bot size={32} />
                    <span>Provide AI-Powered Chat Assistance</span>
                </div>
           </div>
        </section>
        
        {/* Section 4: Final CTA */}
        <section className="cta-section">
          <h2>Ready to See the Future of Railway Control?</h2>
          <p>Experience a system that enhances safety, improves punctuality, and maximizes the efficiency of your rail network.</p>
          <Link to="/dashboard" className="hero-button">
            Launch Simulation
          </Link>
        </section>
      </main>
    </div>
  );
};

export default HomePage;
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock,
  Loader2,
  Mail,
  MapPin,
  Package,
  Phone,
  Search,
  Send,
  Shield,
  Sparkles,
  Star,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

function useScrollReveal(threshold = 0.15) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.unobserve(el);
        }
      },
      { threshold },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, visible];
}

function AnimatedCounter({ end, suffix = "", duration = 2000 }) {
  const [count, setCount] = useState(0);
  const [ref, visible] = useScrollReveal(0.5);
  useEffect(() => {
    if (!visible) return;
    let start = 0;
    const step = end / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= end) {
        setCount(end);
        clearInterval(timer);
      } else setCount(Math.floor(start));
    }, 16);
    return () => clearInterval(timer);
  }, [visible, end, duration]);
  return (
    <strong ref={ref}>
      {count}
      {suffix}
    </strong>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState({});
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    message: "",
  });
  const [scrolled, setScrolled] = useState(false);
  const [heroRef, heroVisible] = useScrollReveal(0.1);
  const [processRef, processVisible] = useScrollReveal(0.1);
  const [trackRef, trackVisible] = useScrollReveal(0.1);
  const [contactRef, contactVisible] = useScrollReveal(0.1);

  // Garment tracking state
  const [trackOrderId, setTrackOrderId] = useState("");
  const [trackResults, setTrackResults] = useState(null);
  const [trackLoading, setTrackLoading] = useState(false);
  const [trackError, setTrackError] = useState("");

  const TRACK_STAGES = [
    "pending",
    "washing",
    "drying",
    "folding",
    "ready",
    "released",
  ];
  const getStageDurations = () => ({
    pending: 0,
    washing: Number(settings.etaWash) || 45,
    drying: Number(settings.etaDrying) || 40,
    folding: Number(settings.etaFolding) || 15,
    ready: 0,
    released: 0,
  });

  function calculateETA(order) {
    const durations = getStageDurations();
    const stages = ["pending", "washing", "drying", "folding", "ready"];

    const currentIndex = stages.indexOf(order.status);
    if (currentIndex === -1 || order.status === "released") return null;

    let remainingMinutes = 0;

    for (let i = currentIndex; i < stages.length; i++) {
      remainingMinutes += durations[stages[i]] || 0;
    }

    // optional: weight factor
    if (order.weight_kg) {
      remainingMinutes += order.weight_kg * 3;
    }

    const eta = new Date(Date.now() + remainingMinutes * 60000);

    return {
      eta,
      remainingMinutes,
    };
  }
  const STAGE_LABELS = {
    pending: "Pending",
    washing: "Wash",
    drying: "Dry",
    folding: "Fold",
    ready: "Ready",
    released: "Released",
  };

  const handleTrack = async (e) => {
    if (e) e.preventDefault();
    const cleaned = trackOrderId.trim();
    if (!cleaned) {
      setTrackError("Please enter your order number");
      setTrackResults(null);
      return;
    }
    setTrackLoading(true);
    setTrackError("");
    setTrackResults(null);
    try {
      const { data: orders, error: ordErr } = await supabase
        .from("orders")
        .select(
          "id, order_number, status, weight_kg, total_price, created_at, customer_id, customers(name), service_types(name)",
        )
        .ilike("order_number", `%${cleaned}%`)
        .not("status", "eq", "cancelled")
        .order("created_at", { ascending: false })
        .limit(10);
      if (ordErr) throw ordErr;
      const enriched = (orders || []).map((o) => ({
        ...o,
        customer_name: o.customers?.name || "Customer",
        service_name: o.service_types?.name || "Service",
      }));
      setTrackResults(enriched.length > 0 ? enriched : null);
      if (enriched.length === 0)
        setTrackError("No orders found for this order number");
    } catch (err) {
      setTrackError("Something went wrong. Please try again.");
    } finally {
      setTrackLoading(false);
    }
  };

  // Poll every 5s + realtime subscription to keep tracking results fresh
  useEffect(() => {
    if (!trackResults || trackResults.length === 0) return;
    const cleaned = trackOrderId.trim();
    if (!cleaned) return;

    const refetch = () => {
      supabase
        .from("orders")
        .select(
          "id, order_number, status, weight_kg, total_price, created_at, customer_id, customers(name), service_types(name)",
        )
        .ilike("order_number", `%${cleaned}%`)
        .not("status", "eq", "cancelled")
        .order("created_at", { ascending: false })
        .limit(10)
        .then(({ data }) => {
          if (data) {
            const enriched = data.map((o) => ({
              ...o,
              customer_name: o.customers?.name || "Customer",
              service_name: o.service_types?.name || "Service",
            }));
            setTrackResults(enriched.length > 0 ? enriched : null);
          }
        });
    };

    // Poll every 5 seconds as reliable fallback
    const interval = setInterval(refetch, 5000);

    // Also subscribe to realtime for instant updates when available
    const channel = supabase
      .channel("track-orders-realtime-" + Date.now())
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        refetch,
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [trackResults !== null, trackOrderId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const stored = localStorage.getItem("4j_laundry_settings");
    if (stored) {
      setSettings(JSON.parse(stored));
    }
  }, []);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setFormData({ name: "", email: "", phone: "", address: "", message: "" });
  };

  const scrollToSection = useCallback((e, id) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  }, []);

  return (
    <div className="landing-page">
      {/* NAVBAR */}
      <nav className={`landing-nav ${scrolled ? "landing-nav-scrolled" : ""}`}>
        <div className="landing-container landing-nav-inner">
          <div className="landing-logo">
            <img
              src="/assets/Rectangle.png"
              alt="4J Laundry"
              className="landing-logo-img-nav"
            />
            <span>4J Laundry</span>
          </div>
          <div className="landing-nav-links">
            <a href="#home" onClick={(e) => scrollToSection(e, "home")}>
              Home
            </a>
            <a href="#process" onClick={(e) => scrollToSection(e, "process")}>
              Process
            </a>
            <a href="#track" onClick={(e) => scrollToSection(e, "track")}>
              Track
            </a>
            <a href="#contact" onClick={(e) => scrollToSection(e, "contact")}>
              Contact
            </a>
            <button
              className="landing-btn-login"
              onClick={() => navigate("/login")}
            >
              Login
              <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </nav>

      {/* HERO SECTION */}
      <section className="landing-hero" id="home">
        {/* Decorative Elements */}
        <div className="hero-decoration hero-decoration-1" />
        <div className="hero-decoration hero-decoration-2" />
        <div className="hero-decoration hero-decoration-3" />
        <div className="hero-blob" />

        <div className="landing-container landing-hero-inner" ref={heroRef}>
          <div
            className={`landing-hero-text ${heroVisible ? "animate-in" : ""}`}
          >
            <div className="landing-hero-badge">
              <Sparkles size={14} />
              <span>Professional Laundry Service</span>
            </div>
            <h1>
              Simplify Your Life with{" "}
              <span className="text-highlight">4J Laundry</span> Service
            </h1>
            <p>
              With over 3 years of experience, 4J Laundry has been dedicated to
              providing exceptional laundry services to our community. We take
              pride in delivering fresh, clean, and perfectly folded garments
              every time.
            </p>
            <div className="landing-hero-buttons">
              <button
                className="landing-btn-primary landing-btn-glow"
                onClick={() => navigate("/login")}
              >
                Login
                <ChevronRight size={18} />
              </button>
              <button
                className="landing-btn-secondary"
                onClick={(e) => scrollToSection(e, "track")}
              >
                Track Garment
              </button>
            </div>
            <div className="landing-hero-stats">
              <div className="landing-stat">
                <AnimatedCounter end={3} suffix="+" />
                <span>Years Experience</span>
              </div>
              <div className="landing-stat-divider" />
              <div className="landing-stat">
                <AnimatedCounter end={1000} suffix="+" />
                <span>Happy Customers</span>
              </div>
              <div className="landing-stat-divider" />
              <div className="landing-stat">
                <AnimatedCounter end={100} suffix="%" />
                <span>Satisfaction</span>
              </div>
            </div>
          </div>
          <div
            className={`landing-hero-image ${heroVisible ? "animate-in-right" : ""}`}
          >
            <div className="landing-hero-image-bg" />
            <div className="landing-hero-image-ring" />
            <img src="/assets/image%2046.png" alt="4J Laundry Service" />
            {/* Floating badges */}
            <div className="hero-float-badge hero-float-badge-1">
              <Star size={16} />
              <span>Top Rated</span>
            </div>
            <div className="hero-float-badge hero-float-badge-2">
              <Clock size={16} />
              <span>Fast Service</span>
            </div>
            <div className="hero-float-badge hero-float-badge-3">
              <Shield size={16} />
              <span>Trusted</span>
            </div>
          </div>
        </div>
      </section>

      {/* WORKING PROCESS */}
      <section className="landing-process" id="process" ref={processRef}>
        <div className="landing-container">
          <div
            className={`landing-section-header ${processVisible ? "animate-in" : ""}`}
          >
            <span className="landing-section-tag">How It Works</span>
            <h2>Our Working Process</h2>
            <p>Simple steps to get your clothes fresh and clean</p>
          </div>
          <div
            className={`landing-process-steps ${processVisible ? "steps-animate" : ""}`}
          >
            {[
              {
                img: "/assets/image%2011.png",
                alt: "Walk-in",
                num: "01",
                title: "Walk-in to Store",
                desc: "Visit our store at Brgy. Palikpikan, Balayan, Batangas",
              },
              null,
              {
                img: "/assets/image%2014.png",
                alt: "Collection",
                num: "02",
                title: "Laundry Collection",
                desc: "We carefully collect and sort your garments",
              },
              null,
              {
                img: "/assets/image%2013.png",
                alt: "Cleaning",
                num: "03",
                title: "Expert Cleaning",
                desc: "Professional washing, drying, and folding",
              },
              null,
              {
                img: "/assets/image%2012.png",
                alt: "Pickup",
                num: "04",
                title: "Ready for Pickup",
                desc: "Pick up your fresh, clean clothes anytime",
              },
            ].map((item, i) =>
              item === null ? (
                <div className="landing-step-connector" key={`conn-${i}`}>
                  <div className="connector-line" />
                </div>
              ) : (
                <div
                  className="landing-step"
                  key={item.num}
                  style={{ animationDelay: `${parseInt(item.num) * 0.15}s` }}
                >
                  <div className="landing-step-icon">
                    <img src={item.img} alt={item.alt} />
                  </div>
                  <div className="landing-step-number">{item.num}</div>
                  <h3>{item.title}</h3>
                  <p>{item.desc}</p>
                </div>
              ),
            )}
          </div>
        </div>
      </section>

      {/* TRACK GARMENT SECTION */}
      <section className="landing-track" id="track" ref={trackRef}>
        <div className="landing-container">
          <div
            className={`landing-section-header ${trackVisible ? "animate-in" : ""}`}
          >
            <span className="landing-section-tag">Order Status</span>
            <h2>Track Your Garment</h2>
            <p>Enter your order number to check the status of your laundry</p>
          </div>

          <div
            className={`track-search-box ${trackVisible ? "animate-in" : ""}`}
          >
            <form className="track-form" onSubmit={handleTrack}>
              <div className="track-input-wrap">
                <Package size={18} className="track-input-icon" />
                <input
                  type="text"
                  placeholder="Enter order number (e.g. 4J-20260327-1234)"
                  value={trackOrderId}
                  onChange={(e) => setTrackOrderId(e.target.value)}
                  required
                />
              </div>
              <button
                type="submit"
                className="landing-btn-primary landing-btn-glow"
                disabled={trackLoading}
              >
                {trackLoading ? (
                  <Loader2 size={18} className="spin" />
                ) : (
                  <Search size={18} />
                )}
                {trackLoading ? "Searching..." : "Track"}
              </button>
            </form>
            {trackError && <p className="track-error">{trackError}</p>}
          </div>

          {trackResults && (
            <div className="track-results">
              {trackResults.map((order) => {
                const currentIdx = TRACK_STAGES.indexOf(order.status);
                const etaData = calculateETA(order);
                return (
                  <div className="track-card" key={order.id}>
                    <div className="track-card-header">
                      <div className="track-card-info">
                        <span className="track-order-num">
                          #{order.order_number}
                        </span>
                        <span className="track-customer">
                          {order.customer_name}
                        </span>
                      </div>
                      <div className="track-card-meta">
                        <span className="track-service">
                          {order.service_name}
                        </span>
                        <span className="track-weight">
                          {order.weight_kg} kg
                        </span>
                      </div>
                    </div>
                    <div className="track-progress">
                      {TRACK_STAGES.map((stage, i) => {
                        const done = i <= currentIdx;
                        const isCurrent = i === currentIdx;
                        return (
                          <div
                            className={`track-step ${done ? "done" : ""} ${isCurrent ? "current" : ""}`}
                            key={stage}
                          >
                            <div className="track-dot">
                              {done ? (
                                <CheckCircle2 size={16} />
                              ) : (
                                <Circle size={16} />
                              )}
                            </div>
                            {i < TRACK_STAGES.length - 1 && (
                              <div
                                className={`track-line ${done && i < currentIdx ? "filled" : ""}`}
                              />
                            )}
                            <span className="track-label">
                              {STAGE_LABELS[stage]}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="track-card-footer">
                      <span>
                        Status:{" "}
                        <strong
                          className={`status-text status-${order.status}`}
                        >
                          {STAGE_LABELS[order.status] || order.status}
                        </strong>
                      </span>

                      <span>
                        Placed:{" "}
                        {new Date(order.created_at).toLocaleDateString(
                          "en-PH",
                          {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          },
                        )}
                      </span>

                      {etaData &&
                        !["ready", "released"].includes(order.status) && (
                          <>
                            <span>
                              ETA:{" "}
                              <strong>
                                {etaData.eta.toLocaleString("en-PH", {
                                  month: "short",
                                  day: "numeric",
                                  hour: "numeric",
                                  minute: "numeric",
                                })}
                              </strong>
                            </span>

                            <span>
                              Est. finish in:{" "}
                              <strong>
                                {Math.ceil(etaData.remainingMinutes / 60)} hrs
                              </strong>
                            </span>
                          </>
                        )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* CONTACT SECTION */}
      <section className="landing-contact" id="contact" ref={contactRef}>
        <div className="landing-container">
          <div
            className={`landing-section-header ${contactVisible ? "animate-in" : ""}`}
          >
            <span className="landing-section-tag">Get In Touch</span>
            <h2>Let's Talk With Us</h2>
            <p>Have questions? We'd love to hear from you.</p>
          </div>
          <div
            className={`landing-contact-grid ${contactVisible ? "animate-in" : ""}`}
          >
            <div className="landing-contact-info">
              <div className="contact-info-glow" />
              <h3>Contact Information</h3>
              <p>Reach out to us through any of these channels</p>
              <div className="landing-contact-items">
                <div className="landing-contact-item">
                  <div className="landing-contact-icon">
                    <Phone size={20} />
                  </div>
                  <div>
                    <strong>Phone</strong>
                    <span>0916-048-7671</span>
                    <span>0955-381-0168</span>
                  </div>
                </div>
                <div className="landing-contact-item">
                  <div className="landing-contact-icon">
                    <Mail size={20} />
                  </div>
                  <div>
                    <strong>Email</strong>
                    <span>jadiedacillo2@gmail.com</span>
                  </div>
                </div>
                <div className="landing-contact-item">
                  <div className="landing-contact-icon">
                    <MapPin size={20} />
                  </div>
                  <div>
                    <strong>Address</strong>
                    <span>Brgy. Palikpikan, Balayan, Batangas</span>
                  </div>
                </div>
              </div>
            </div>
            <form className="landing-contact-form" onSubmit={handleSubmit}>
              <div className="landing-form-row">
                <div className="landing-form-group">
                  <label>Name</label>
                  <input
                    type="text"
                    name="name"
                    placeholder="Your Name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div className="landing-form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    name="email"
                    placeholder="Your Email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                  />
                </div>
              </div>
              <div className="landing-form-row">
                <div className="landing-form-group">
                  <label>Phone</label>
                  <input
                    type="tel"
                    name="phone"
                    placeholder="Your Phone"
                    value={formData.phone}
                    onChange={handleChange}
                  />
                </div>
                <div className="landing-form-group">
                  <label>Address</label>
                  <input
                    type="text"
                    name="address"
                    placeholder="Your Address"
                    value={formData.address}
                    onChange={handleChange}
                  />
                </div>
              </div>
              <div className="landing-form-group">
                <label>Message</label>
                <textarea
                  name="message"
                  placeholder="Your Message"
                  rows="4"
                  value={formData.message}
                  onChange={handleChange}
                  required
                />
              </div>
              <button
                type="submit"
                className="landing-btn-primary landing-btn-glow"
              >
                <Send size={16} />
                Send Message
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="landing-footer">
        <div className="landing-container landing-footer-inner">
          <div className="landing-footer-brand">
            <div className="landing-logo">
              <img
                src="/assets/Rectangle.png"
                alt="4J Laundry"
                className="landing-logo-img"
              />
              <span>
                <strong>4J</strong> Laundry Shop
              </span>
            </div>
            <p>
              Laundry service providers offer professionals laundering solutions
              to assist individuals and business in achieving optimal garment
              care and cleanliness
            </p>
          </div>
          <div className="landing-footer-divider" />
          <div className="landing-footer-contact">
            <h4>Contact Info</h4>
            <div className="landing-footer-contact-card">
              <div className="landing-footer-contact-item">
                <Phone size={18} />
                <span>0976-048-7671 | 0955-381-0168</span>
              </div>
              <div className="landing-footer-contact-item">
                <Mail size={18} />
                <span>jadiedacillo21@gmail.com</span>
              </div>
              <div className="landing-footer-contact-item">
                <MapPin size={18} />
                <span>Brgy. Palikpikan, Balayan, Batangas.</span>
              </div>
            </div>
          </div>
        </div>
        <div className="landing-footer-bottom">
          <div className="landing-container">
            <p>
              Copyright &copy; {new Date().getFullYear()} 4j. All rights
              reserved
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

import { useState, useEffect, useRef } from 'react';
import { Mail, MessageCircle, Calendar, Send, Phone, MapPin, Sparkles } from 'lucide-react';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { supabase } from '@/integrations/supabase/client';

const ContactSection = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    message: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const sectionRef = useRef<HTMLElement>(null);
  const { settings: contactSettings, loading } = useSiteSettings('contact');

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.2 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitStatus('idle');

    try {
      const { error } = await supabase.functions.invoke('send-contact-email', {
        body: formData,
      });

      if (error) throw error;

      setSubmitStatus('success');
      setFormData({ name: '', email: '', message: '' });
    } catch (err) {
      console.error('Failed to send message:', err);
      setSubmitStatus('error');
    } finally {
      setSubmitting(false);
    }
  };

  // Default values
  const defaultSettings = {
    title: "Connect With Me",
    subtitle: "Let's collaborate",
    methods: [
      {
        title: "Schedule a Meeting",
        description: "Book a consultation to discuss your project requirements and explore how we can work together.",
        action: "Schedule Now",
        highlight: true
      },
      {
        title: "Send an Email", 
        description: "Drop me a line with your project details and I'll get back to you within 24 hours.",
        action: "Send Email",
        highlight: false
      }
    ]
  };

  const settings = contactSettings || defaultSettings;

  if (loading) {
    return (
      <section className="py-24 relative bg-gradient-to-b from-primary/5 to-background">
        <div className="section-container">
          <div className="animate-pulse text-primary text-center">Loading contact section...</div>
        </div>
      </section>
    );
  }

  return (
    <section ref={sectionRef} id="contact" className="py-24 relative bg-gradient-to-b from-primary/5 to-background overflow-hidden">
      {/* Background Elements */}
      <div className="absolute top-20 left-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl"></div>
      <div className="absolute bottom-0 right-0 w-64 h-64 bg-accent/10 rounded-full blur-3xl"></div>
      <div className="absolute top-1/2 right-20 text-accent/5">
        <Sparkles className="h-24 w-24" />
      </div>
      
      <div className="section-container relative z-10">
        <div className={`fade-in-luxury ${isVisible ? 'visible' : ''}`}>
          
          {/* Section Header */}
          <div className="text-center mb-16">
            <div className="text-lg text-accent font-medium mb-4">{settings.subtitle}</div>
            <h2 className="text-5xl font-bold mb-6 bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              {settings.title}
            </h2>
            <div className="w-24 h-1 bg-gradient-to-r from-primary to-accent mx-auto rounded-full"></div>
          </div>

          {/* Main Content Grid */}
          <div className="grid lg:grid-cols-2 gap-16">
            
            {/* Left Column - Contact Options */}
            <div>
              <h3 className="text-2xl font-semibold mb-8 text-primary">Enhanced Contact Options</h3>
              
              <div className="space-y-6 mb-8">
                {settings.methods.map((method, index) => (
                  <div key={index} className={`glass-card p-6 hover:shadow-elegant transition-all duration-300 group ${method.highlight ? 'border-primary/20' : ''}`}>
                    <div className="flex items-start gap-4">
                      <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${method.highlight ? 'bg-primary/20' : 'bg-accent/20'}`}>
                        {index === 0 ? (
                          <Calendar className={`h-6 w-6 ${method.highlight ? 'text-primary' : 'text-accent'}`} />
                        ) : (
                          <Mail className={`h-6 w-6 ${method.highlight ? 'text-primary' : 'text-accent'}`} />
                        )}
                      </div>
                      <div className="flex-1">
                        <h4 className="text-lg font-semibold mb-2 text-foreground">{method.title}</h4>
                        <p className="text-muted-foreground text-sm mb-4 leading-relaxed">{method.description}</p>
                        <button className={`text-sm font-medium ${method.highlight ? 'text-primary hover:text-primary/80' : 'text-accent hover:text-accent/80'} transition-colors group-hover:underline`}>
                          {method.action} →
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button className="btn-primary w-full group">
                <Calendar className="mr-2 h-5 w-5" />
                Schedule a Meeting
                <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-primary to-accent opacity-0 group-hover:opacity-20 transition-opacity duration-300"></div>
              </button>
            </div>

            {/* Right Column - Contact Form */}
            <div>
              <div className="glass-premium p-8">
                <h3 className="text-2xl font-semibold mb-8 text-accent">Premium Contact Form</h3>
                
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium text-foreground mb-2">
                      Full Name
                    </label>
                    <input
                      type="text"
                      id="name"
                      name="name"
                      value={formData.name}
                      onChange={handleInputChange}
                      className="input-luxury"
                      placeholder="Enter your full name"
                      required
                    />
                  </div>
                  
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-foreground mb-2">
                      Email Address
                    </label>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      className="input-luxury"
                      placeholder="Enter your email address"
                      required
                    />
                  </div>
                  
                  <div>
                    <label htmlFor="message" className="block text-sm font-medium text-foreground mb-2">
                      Project Details
                    </label>
                    <textarea
                      id="message"
                      name="message"
                      rows={6}
                      value={formData.message}
                      onChange={handleInputChange}
                      className="input-luxury resize-none"
                      placeholder="Tell me about your project requirements, timeline, and any specific needs..."
                      required
                    />
                  </div>
                  
                  <button type="submit" disabled={submitting} className="btn-secondary w-full group disabled:opacity-60 disabled:cursor-not-allowed">
                    <Send className="mr-2 h-5 w-5 transform group-hover:translate-x-1 transition-transform" />
                    {submitting ? 'Sending...' : 'Send Message'}
                  </button>

                  {submitStatus === 'success' && (
                    <p className="text-sm text-green-500 text-center">
                      Message sent! I'll get back to you soon.
                    </p>
                  )}
                  {submitStatus === 'error' && (
                    <p className="text-sm text-red-500 text-center">
                      Something went wrong. Please try again or email me directly.
                    </p>
                  )}
                </form>

                {/* Additional Contact Info */}
                <div className="mt-8 pt-8 border-t border-border/50">
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-primary" />
                      <span>+1 (555) 123-4567</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-accent" />
                      <span>San Francisco, CA</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ContactSection;
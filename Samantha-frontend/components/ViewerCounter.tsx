import React, { useEffect, useState } from 'react';

const ViewerCounter: React.FC = () => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    // Get current count from localStorage
    const currentCount = parseInt(localStorage.getItem('activeVisitors') || '0');
    
    // Add this visitor
    const newCount = currentCount + 1;
    localStorage.setItem('activeVisitors', newCount.toString());
    setCount(newCount);

    // Handle page unload/close
    const handleUnload = () => {
      const count = parseInt(localStorage.getItem('activeVisitors') || '1');
      const updatedCount = Math.max(0, count - 1); // Ensure we don't go below 0
      localStorage.setItem('activeVisitors', updatedCount.toString());
    };

    // Add unload event listener
    window.addEventListener('beforeunload', handleUnload);

    // Cleanup
    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      handleUnload(); // Decrement counter when component unmounts
    };
  }, []);

  return (
    <div className="viewer-counter">
      Active Visitors: {count}
    </div>
  );
};

export default ViewerCounter; 
import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { OutpassRequest } from '../types';
import { X, Printer, ShieldCheck, CheckCircle2, AlertTriangle, Building2, Calendar, MapPin, User, Clock } from 'lucide-react';

interface PrintableOutpassModalProps {
  outpass: OutpassRequest;
  onClose: () => void;
}

export const PrintableOutpassModal: React.FC<PrintableOutpassModalProps> = ({ outpass, onClose }) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  useEffect(() => {
    // Generate QR Code payload for Gatekeeper verification
    const payload = JSON.stringify({
      outpassId: outpass.outpassId,
      studentRegNo: outpass.studentRegNo,
      studentName: outpass.studentName,
      status: outpass.status,
      departure: outpass.departureDateTime,
      return: outpass.returnDateTime,
      token: outpass.verificationToken
    });

    QRCode.toDataURL(payload, {
      width: 240,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    })
      .then(url => setQrDataUrl(url))
      .catch(err => console.error('QR code generation failed', err));
  }, [outpass]);

  const handlePrint = () => {
    window.print();
  };

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden my-auto">
        {/* Top bar (Hidden on print) */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950 no-print">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
              {outpass.outpassId}
            </span>
            <span className="text-xs text-zinc-400">Institutional Digital Pass</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-xs transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / Download PDF</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Pass Container */}
        <div id="printable-outpass-pass" className="p-6 sm:p-8 bg-white text-zinc-900">
          {/* Institutional Header */}
          <div className="border-b-2 border-zinc-900 pb-4 text-center">
            <div className="flex items-center justify-between mb-2">
              <div className="text-left font-mono text-[11px] font-bold text-zinc-700">
                <p>ANNA UNIVERSITY</p>
                <p>MIT CAMPUS HOSTELS</p>
              </div>
              <div className="w-12 h-12 rounded-full border-2 border-zinc-900 flex items-center justify-center font-bold text-xs font-mono">
                MIT
              </div>
              <div className="text-right font-mono text-[11px] font-bold text-zinc-700">
                <p>ACADEMIC YEAR</p>
                <p>{outpass.academicYear}</p>
              </div>
            </div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight uppercase text-zinc-950">
              Hostel Digital Outpass Certificate
            </h1>
            <p className="text-xs text-zinc-600 font-medium">
              Madras Institute of Technology, Chromepet, Chennai - 600044
            </p>
          </div>

          {/* Status & ID Banner */}
          <div className="flex items-center justify-between my-4 p-3 bg-zinc-100 border border-zinc-300 rounded-lg">
            <div>
              <p className="text-[10px] font-mono text-zinc-500 uppercase">Outpass ID</p>
              <p className="text-base font-mono font-bold text-zinc-950">{outpass.outpassId}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] font-mono text-zinc-500 uppercase">Current Status</p>
              <span className={`inline-block font-mono text-xs font-extrabold px-3 py-1 rounded-full uppercase ${
                outpass.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800 border border-emerald-400' :
                outpass.status === 'OUT_OF_CAMPUS' ? 'bg-blue-100 text-blue-800 border border-blue-400' :
                outpass.status === 'RETURNED_TO_CAMPUS' ? 'bg-zinc-200 text-zinc-800 border border-zinc-400' :
                outpass.status === 'REJECTED' ? 'bg-red-100 text-red-800 border border-red-400' :
                'bg-amber-100 text-amber-800 border border-amber-400'
              }`}>
                {outpass.status.replace(/_/g, ' ')}
              </span>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-mono text-zinc-500 uppercase">Verification Code</p>
              <p className="text-xs font-mono font-semibold text-zinc-700">{outpass.verificationToken}</p>
            </div>
          </div>

          {/* Main Grid: Student Info & QR Code */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 my-5">
            {/* Left 2 Cols: Details */}
            <div className="sm:col-span-2 space-y-3">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-[11px] text-zinc-500 block">Student Name:</span>
                  <span className="font-bold text-zinc-950">{outpass.studentName}</span>
                </div>
                <div>
                  <span className="text-[11px] text-zinc-500 block">Register Number:</span>
                  <span className="font-mono font-bold text-zinc-950">{outpass.studentRegNo}</span>
                </div>
                <div>
                  <span className="text-[11px] text-zinc-500 block">Hostel Block & Room:</span>
                  <span className="font-semibold text-zinc-900">{outpass.hostelBlock} Block • Rm {outpass.roomNumber}</span>
                </div>
                <div>
                  <span className="text-[11px] text-zinc-500 block">Branch & Year:</span>
                  <span className="font-medium text-zinc-900">{outpass.branch} ({outpass.year} Yr)</span>
                </div>
                <div>
                  <span className="text-[11px] text-zinc-500 block">Student Contact:</span>
                  <span className="font-mono text-zinc-900">{outpass.studentPhone}</span>
                </div>
                <div>
                  <span className="text-[11px] text-zinc-500 block">Parent Contact:</span>
                  <span className="font-mono font-semibold text-zinc-950">{outpass.parentPhone}</span>
                </div>
              </div>

              <div className="border-t border-zinc-200 pt-3 text-xs space-y-1.5">
                <div>
                  <span className="text-[11px] text-zinc-500 block">Destination of Visit:</span>
                  <span className="font-bold text-zinc-950">{outpass.destination}</span>
                </div>
                <div>
                  <span className="text-[11px] text-zinc-500 block">Purpose of Leave:</span>
                  <span className="text-zinc-800">{outpass.purpose}</span>
                </div>
                <div>
                  <span className="text-[11px] text-zinc-500 block">Residential / Contact Address:</span>
                  <span className="text-zinc-700">{outpass.visitAddress}</span>
                </div>
              </div>
            </div>

            {/* Right Col: Gate QR Code */}
            <div className="flex flex-col items-center justify-center p-3 bg-zinc-50 border border-zinc-300 rounded-xl text-center">
              <p className="text-[10px] font-mono text-zinc-500 uppercase mb-2">Gate Security QR</p>
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="Outpass QR" className="w-36 h-36 border border-zinc-200 p-1 bg-white rounded shadow-sm" />
              ) : (
                <div className="w-36 h-36 bg-zinc-200 flex items-center justify-center text-xs text-zinc-500">
                  Generating QR...
                </div>
              )}
              <p className="text-[10px] font-mono text-zinc-600 mt-2">Scan at Main Gate</p>
            </div>
          </div>

          {/* Departure and Return Schedule */}
          <div className="grid grid-cols-2 gap-4 p-3 bg-zinc-50 border border-zinc-200 rounded-lg text-xs my-4">
            <div>
              <p className="text-[11px] font-mono text-zinc-500 uppercase flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-zinc-700" />
                Sanctioned Departure
              </p>
              <p className="text-sm font-mono font-bold text-zinc-950 mt-1">
                {formatDate(outpass.departureDateTime)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-mono text-zinc-500 uppercase flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-zinc-700" />
                Mandatory Return Time
              </p>
              <p className="text-sm font-mono font-bold text-zinc-950 mt-1">
                {formatDate(outpass.returnDateTime)}
              </p>
            </div>
          </div>

          {/* Endorsement & Signatures block */}
          <div className="border-t-2 border-zinc-800 pt-4 mt-6">
            <div className="grid grid-cols-3 gap-4 text-center text-xs">
              {/* RC Endorsement */}
              <div className="p-2 border border-zinc-200 rounded bg-zinc-50">
                <p className="font-semibold text-zinc-900">Resident Counsellor (RC)</p>
                {outpass.rcDecision ? (
                  <div className="mt-2 text-[11px]">
                    <span className="font-bold text-emerald-700 block">✓ Endorsed</span>
                    <span className="text-zinc-600 text-[10px]">{outpass.rcDecision.rcName}</span>
                    <span className="text-zinc-500 text-[9px] block">Parent Call: {outpass.rcDecision.parentCallVerified ? 'VERIFIED' : 'NOTED'}</span>
                  </div>
                ) : (
                  <p className="text-zinc-400 text-[11px] mt-4 italic">Pending Endorsement</p>
                )}
              </div>

              {/* Gate Security */}
              <div className="p-2 border border-zinc-200 rounded bg-zinc-50">
                <p className="font-semibold text-zinc-900">Main Gate Security</p>
                {outpass.gateLogs?.departedAt ? (
                  <div className="mt-2 text-[11px]">
                    <span className="font-bold text-blue-700 block">Exited Campus</span>
                    <span className="text-zinc-600 text-[10px]">{formatDate(outpass.gateLogs.departedAt)}</span>
                    <span className="text-zinc-500 text-[9px] block">{outpass.gateLogs.departedGatePost}</span>
                  </div>
                ) : (
                  <p className="text-zinc-400 text-[11px] mt-4 italic">Exit Stamp Pending</p>
                )}
              </div>

              {/* Hostel Office */}
              <div className="p-2 border border-zinc-200 rounded bg-zinc-50">
                <p className="font-semibold text-zinc-900">Hostel Office / Warden</p>
                <div className="mt-2 text-[11px]">
                  <span className="font-bold text-zinc-800 block">Digital System Seal</span>
                  <span className="text-zinc-500 text-[9px] block">Verified in Firestore</span>
                  <span className="text-zinc-400 text-[9px] block">20-Year Archive Logged</span>
                </div>
              </div>
            </div>

            <p className="text-[10px] text-zinc-500 text-center mt-4">
              Note: This is an authentic computer-generated digital hostel outpass issued by MIT Hostels, Anna University. Tampering or falsifying details is punishable under campus hostel bylaws.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
